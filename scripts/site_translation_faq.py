"""Derive translated FAQ schema from the translated visible answer, once.

Question/answer locations are resolved against the editorial source before
translation. This avoids independently translating schema into different prose.
"""
import json
import re
from functools import lru_cache
from faq_question_audit import Document, Element, compact, faq_nodes, question_elements
from site_translation_units import Parser, all_nodes
from inject_faq_schema import (MANAGED_MARKER, FAQ_DETAILS_RE, extract_faqs, build_faqpage,
                               replace_or_insert)


def text(node):
    return re.sub(r'\s+', ' ', node.text()).strip()


def inside(node, container):
    while node is not None:
        if node is container:
            return True
        node = node.parent
    return False


def answer_blocks(nodes):
    # Nested wrappers around the same answer are one location. Separate
    # occurrences are ambiguous even when their source prose is identical.
    return [node for node in nodes
            if not any(other is not node and inside(other, node) for other in nodes)]


@lru_cache(maxsize=256)
def source_layout(original):
    source_doc = Document(original)
    source_nodes = list(source_doc.root.walk())
    indexes = {id(node): index for index, node in enumerate(source_nodes)}
    questions = question_elements(source_doc.root)
    by_text = {}
    for node in source_nodes:
        value = compact(node.text())
        if value:
            by_text.setdefault(value, []).append(node)
    return source_nodes, indexes, questions, by_text


def synchronize(original, translated, url, locale):
    if 'FAQPage' not in original:
        return translated
    source_nodes, indexes, questions, by_text = source_layout(original)
    target_nodes = list(Document(translated).root.walk())
    target_elements = [node for node in all_nodes(Parser(translated).root)
                       if not node.tag.startswith('#')]
    if len(source_nodes) != len(target_nodes):
        raise ValueError('Translation changed FAQ document structure')
    if len(target_elements) != len(target_nodes):
        raise ValueError('FAQ element locations cannot be verified')

    question_markers = {}

    def counterpart(node):
        target = target_nodes[indexes[id(node)]]
        if node.tag != target.tag:
            raise ValueError('Translation reordered a FAQ answer container')
        return target

    def visible_pair(entity):
        candidates = [q for q in questions if compact(q.text()) == compact(entity['name'])]
        if len(candidates) != 1:
            raise ValueError('FAQ question has no unique visible source: ' + entity['name'])
        question = candidates[0]
        answer = entity.get('acceptedAnswer', {}).get('text', '')
        answer_nodes = by_text.get(compact(Document(answer).root.text()), [])
        translated_question = counterpart(question)
        location = target_elements[indexes[id(question)]]
        if location.tag != translated_question.tag:
            raise ValueError('FAQ question location has changed')
        # Native summaries are already identifiable in every language. Keep
        # their managed markup unchanged for the FAQ generator's extractor.
        if location.tag != 'summary' and 'data-faq-question' not in location.attrs:
            question_markers[location.inner - 1] = ' data-faq-question=""'
        container = question.parent
        while container is not None:
            classes = set((container.attrs.get('class') or '').split())
            if container.tag in ('details', 'p') or classes & {'faq-item', 'lpr-faq-item', 'app-card'}:
                break
            container = container.parent
        if container is not None:
            answer_nodes = [node for node in answer_nodes if inside(node, container)]
        answer_nodes = answer_blocks(answer_nodes)
        if answer_nodes:
            if len(answer_nodes) != 1:
                raise ValueError('FAQ answer has ambiguous visible sources: ' + entity['name'])
            translated_answer = text(counterpart(answer_nodes[0]))
        elif question.parent.tag in ('details', 'p'):
            # Some editorial schemas omit the final related link. Use the
            # complete visible answer from this same FAQ, including that link.
            container = counterpart(question.parent)
            def without_question(node):
                if node is translated_question:
                    return ''
                if isinstance(node, Element):
                    return ''.join(without_question(c) for c in node.children)
                return node
            translated_answer = re.sub(r'\s+', ' ', without_question(container)).strip()
        else:
            raise ValueError('FAQ answer has no exact visible source: ' + entity['name'])
        if not translated_answer:
            raise ValueError('Translation removed a FAQ answer')
        return text(translated_question), translated_answer

    replacements = []
    source_scripts = [n for n in all_nodes(Parser(original).root)
                      if n.tag == 'script' and n.attrs.get('type') == 'application/ld+json']
    target_scripts = [n for n in all_nodes(Parser(translated).root)
                      if n.tag == 'script' and n.attrs.get('type') == 'application/ld+json']
    for before, after in zip(source_scripts, target_scripts):
        old = json.loads(original[before.inner:before.end])
        new = json.loads(translated[after.inner:after.end])
        old_faqs, new_faqs = list(faq_nodes(old)), list(faq_nodes(new))
        if len(old_faqs) != len(new_faqs):
            raise ValueError('Translation changed the FAQ schema structure')
        for source_faq, target_faq in zip(old_faqs, new_faqs):
            target_faq['inLanguage'] = locale
            target_faq['@id'] = url + '#faq'
            target_faq['mainEntity'] = [
                {'@type': 'Question', 'name': q,
                 'acceptedAnswer': {'@type': 'Answer', 'text': a}}
                for q, a in (visible_pair(e) for e in source_faq['mainEntity'])]
        if old_faqs:
            replacements.append((after.inner, after.end, json.dumps(new, ensure_ascii=False, indent=2)))
    replacements.extend((position, position, marker) for position, marker in question_markers.items())
    for start, end, value in sorted(replacements, reverse=True):
        translated = translated[:start] + value + translated[end:]
    # Some older marked schemas use details.faq-item and are no longer owned
    # by the current extractor. Their visible pairs were synchronized above.
    if MANAGED_MARKER in original and FAQ_DETAILS_RE.search(original):
        faqs = extract_faqs(translated, locale)
        if not faqs:
            raise ValueError('No translated answers for managed FAQ schema')
        translated = replace_or_insert(translated, build_faqpage(url, locale, faqs))
    return translated
