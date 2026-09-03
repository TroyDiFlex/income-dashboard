// Installation needs a manifest and HTTPS; no offline cache is registered.
(() => {
  const buttons = [...document.querySelectorAll('[data-install]')];
  const dialog = document.getElementById('install-dialog');
  const displayMode = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;
  let installed = false;
  let prompting = false;

  function updateDisplay() {
    const standalone = displayMode.matches || navigator.standalone === true;
    document.documentElement.toggleAttribute('data-standalone', standalone);
    buttons.forEach(button => {
      button.hidden = standalone || installed;
      button.disabled = prompting;
    });
    if (standalone || installed) dialog.close();
  }

  function updateThemeColor() {
    document.querySelector('meta[name="theme-color"]').content =
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateDisplay();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    updateDisplay();
  });
  displayMode.addEventListener('change', updateDisplay);
  window.addEventListener('pageshow', updateDisplay);

  buttons.forEach(button => button.addEventListener('click', async () => {
    if (prompting) return;
    const prompt = installPrompt;
    if (!prompt) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    installPrompt = null;
    prompting = true;
    updateDisplay();
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      if (!dialog.open) dialog.showModal();
    } finally {
      prompting = false;
      updateDisplay();
    }
  }));
  dialog.querySelector('[data-install-close]').addEventListener('click', () => dialog.close());
  new MutationObserver(updateThemeColor).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });
  updateThemeColor();
  updateDisplay();
})();
