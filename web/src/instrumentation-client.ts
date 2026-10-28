if (process.env.NODE_ENV === 'development') {
  // shortcut: clean existing browser-tool attributes once; revisit if tooling injects them during hydration.
  document.querySelectorAll('[__gcrremoteframetoken], [__gcruniqueid]').forEach((element) => {
    element.removeAttribute('__gcrremoteframetoken')
    element.removeAttribute('__gcruniqueid')
  })
}
