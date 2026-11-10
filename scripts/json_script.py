"""JSON text for the body of a ``<script>`` element (JSON-LD).

``json.dumps`` leaves ``<`` alone. Inside ``<script>`` the HTML tokenizer ends
the element at ``</script`` (any letter case, followed by whitespace, ``/`` or
``>``), and ``<!--`` moves it into the escaped states. A JSON string value that
carries either sequence therefore turns the rest of the block into live
markup. The generators read values decoded from HTML (``&lt;`` becomes ``<``)
or from JSON (``\\u003c`` becomes ``<``), so a value that was inert on the
source page can be written back raw into every generated page.

Only those two sequences are escaped, with JSON's own escapes: ``\\/`` and
``\\u003c`` decode to the same characters, so every reader of the structured
data receives the same value, and output without the sequences stays
byte-identical to plain ``json.dumps``. In JSON text ``<`` occurs only inside
strings, where both escapes are valid.
"""
import json


def json_for_script(obj, **kwargs):
    """``json.dumps(obj, **kwargs)`` that cannot close or escape a ``<script>``."""
    return json.dumps(obj, **kwargs).replace('<!--', '\\u003c!--').replace('</', '<\\/')
