/* Start silently when visible; keep native playback and a manual fallback. */
(() => {
  const film = document.querySelector('.home-film');
  if (!film) return;
  const video = film.querySelector('video');
  const button = film.querySelector('.home-film__play');
  const status = film.querySelector('.home-film__status');
  if (!video || !button || !status) return;
  let failed = false;
  let observer;
  const stopAutoplay = () => observer?.disconnect();
  const showFailure = () => {
    const focused = document.activeElement === video || document.activeElement === button;
    failed = true;
    video.controls = true;
    video.pause();
    button.hidden = false;
    button.setAttribute('aria-label', '動画の再生をもう一度試す');
    status.hidden = false;
    if (focused) button.focus({ preventScroll: true });
  };
  video.controls = false;
  button.hidden = false;
  button.addEventListener('click', async () => {
    stopAutoplay();
    video.controls = true;
    // Transfer focus before play fires and hides the introductory button.
    video.focus({ preventScroll: true });
    if (failed) video.load();
    status.hidden = true;
    try {
      await video.play();
      failed = false;
    } catch (error) {
      // A deliberate pause while loading cancels play without a media failure.
      if (error.name !== 'AbortError') showFailure();
    }
  });
  video.addEventListener('play', () => { stopAutoplay(); button.hidden = true; });
  video.addEventListener('playing', () => { failed = false; status.hidden = true; });
  video.addEventListener('ended', () => { button.hidden = false; });
  video.addEventListener('error', showFailure);
  // A failed <source> does not bubble to the video and can leave play pending.
  video.querySelectorAll('source').forEach(source => source.addEventListener('error', showFailure));

  // Do not fetch or finish the below-the-fold film before the visitor sees it.
  // A manual pause stays paused: automatic playback is attempted only once.
  if ('IntersectionObserver' in window) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .35) ||
          reducedMotion.matches || document.activeElement === button) return;
      stopAutoplay();
      video.muted = true;
      video.controls = true;
      video.play().catch(error => {
        if (error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') {
          // Browser policy can require a tap; this is not a media failure.
          video.controls = false;
          button.hidden = false;
        } else {
          showFailure();
        }
      });
    }, { threshold: .35 });
    observer.observe(video);
  }
})();
