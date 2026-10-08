/* Playback is visitor-initiated. Without JavaScript, native controls are present. */
(() => {
  const film = document.querySelector('.home-film');
  if (!film) return;
  const video = film.querySelector('video');
  const button = film.querySelector('.home-film__play');
  const status = film.querySelector('.home-film__status');
  if (!video || !button || !status) return;
  let failed = false;
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
    video.controls = true;
    // Transfer focus before play fires and hides the introductory button.
    video.focus({ preventScroll: true });
    if (failed) video.load();
    status.hidden = true;
    try {
      await video.play();
      failed = false;
    } catch {
      showFailure();
    }
  });
  video.addEventListener('play', () => { button.hidden = true; });
  video.addEventListener('playing', () => { failed = false; status.hidden = true; });
  video.addEventListener('ended', () => { button.hidden = false; });
  video.addEventListener('error', showFailure);
  // A failed <source> does not bubble to the video and can leave play pending.
  video.querySelectorAll('source').forEach(source => source.addEventListener('error', showFailure));
})();
