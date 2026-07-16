/** Reset window + overflow containers to top (WeChat may restore scroll after paint). */
export function scrollToTop(containerSelectors: string[] = []) {
  const apply = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    for (const selector of containerSelectors) {
      document.querySelectorAll(selector).forEach((node) => {
        if (node instanceof HTMLElement) {
          node.scrollTop = 0;
          node.scrollLeft = 0;
        }
      });
    }
  };

  apply();
  window.requestAnimationFrame(() => {
    apply();
    window.requestAnimationFrame(apply);
  });
  window.setTimeout(apply, 50);
  window.setTimeout(apply, 150);
  window.setTimeout(apply, 300);
}
