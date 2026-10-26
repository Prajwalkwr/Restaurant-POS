import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const revealSelector = 'section, article, main > *, .grid > *';

export default function ScrollReveal() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (pathname !== '/') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const observed = new WeakSet<Element>();
    const revealObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('scroll-reveal--visible');
            observer.unobserve(entry.target);
          });
        }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' })
      : null;

    const observeCandidate = (element: Element) => {
      if (observed.has(element)) return;
      observed.add(element);

      const bounds = element.getBoundingClientRect();
      if (bounds.top < window.innerHeight - 32 && bounds.bottom > 0) {
        element.classList.add('scroll-reveal--visible');
        return;
      }

      if (!revealObserver) {
        element.classList.add('scroll-reveal--visible');
        return;
      }

      element.classList.add('scroll-reveal');
      revealObserver.observe(element);
    };

    const observeCandidates = (root: ParentNode) => {
      if (root instanceof Element && root.matches(revealSelector)) {
        observeCandidate(root);
      }
      root.querySelectorAll(revealSelector).forEach(observeCandidate);
    };

    observeCandidates(document);

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) observeCandidates(node);
        });
      });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      revealObserver?.disconnect();
    };
  }, [pathname]);

  return null;
}
