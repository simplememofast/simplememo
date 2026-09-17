// Exact, reviewable CSS control for the offscreen native video experiment.
// No HTML, scripts, media URLs or event handlers are removed by this control.
export const VIDEO_RULE = `/* home-video-render:start */
@supports (content-visibility: auto) and selector(:has(:target)) {
  @media screen {
    html[lang="ja"] main > figure.lp-video {
      content-visibility: auto;
      contain-intrinsic-block-size: auto 600px;
    }
    html[lang="ja"] main > figure.lp-video:focus-within,
    html[lang="ja"] main > figure.lp-video:target,
    html[lang="ja"]:has(:target) main > figure.lp-video {
      content-visibility: visible;
    }
  }
}
/* home-video-render:end */`;
export function withoutVideoRule(text) {
  if (typeof text !== 'string' || text.split(VIDEO_RULE).length !== 2
      || text.split('home-video-render:start').length !== 2
      || text.split('home-video-render:end').length !== 2) {
    throw new Error('Expected exactly one intact native-video rendering rule');
  }
  return text.replace(VIDEO_RULE, '');
}
