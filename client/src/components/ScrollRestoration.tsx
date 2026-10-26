import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

type ScrollPosition = { x: number; y: number };
type LocationState = { key: string; pathname: string; hash: string; storageKey: string };

const getStorageKey = (pathname: string, search: string, hash: string) =>
  `restopos-scroll:${pathname}${search}${hash}`;

const readPosition = (key: string): ScrollPosition | undefined => {
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return undefined;
    const position: unknown = JSON.parse(value);
    if (
      typeof position === 'object'
      && position !== null
      && 'x' in position
      && 'y' in position
      && typeof position.x === 'number'
      && typeof position.y === 'number'
    ) {
      return { x: position.x, y: position.y };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const savePosition = (key: string, position: ScrollPosition) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(position));
  } catch {
    return;
  }
};

export default function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const currentLocation = useRef<LocationState>({
    key: location.key,
    pathname: location.pathname,
    hash: location.hash,
    storageKey: getStorageKey(location.pathname, location.search, location.hash),
  });
  const positions = useRef(new Map<string, ScrollPosition>());
  const hasMounted = useRef(false);

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    const nextLocation: LocationState = {
      key: location.key,
      pathname: location.pathname,
      hash: location.hash,
      storageKey: getStorageKey(location.pathname, location.search, location.hash),
    };
    const previousLocation = currentLocation.current;
    const isInitialLocation = !hasMounted.current;
    hasMounted.current = true;

    if (!isInitialLocation && previousLocation.key === location.key) return;
    if (!isInitialLocation) {
      const previousPosition = { x: window.scrollX, y: window.scrollY };
      positions.current.set(previousLocation.key, previousPosition);
      savePosition(previousLocation.storageKey, previousPosition);
      currentLocation.current = nextLocation;
      if (previousLocation.pathname === location.pathname && previousLocation.hash === location.hash) return;
    }

    const target = isInitialLocation
      ? readPosition(nextLocation.storageKey)
      : navigationType === 'POP'
        ? positions.current.get(location.key) ?? readPosition(nextLocation.storageKey)
        : undefined;
    const targetPosition = target ?? { x: 0, y: 0 };
    let observer: ResizeObserver | undefined;
    let timeout: number | undefined;
    let frame = 0;

    const restore = () => {
      const maximumY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const maximumX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const canReachTarget = maximumY >= targetPosition.y && maximumX >= targetPosition.x;
      if (!canReachTarget && Date.now() < deadline) return;

      window.scrollTo({
        left: Math.min(targetPosition.x, maximumX),
        top: Math.min(targetPosition.y, maximumY),
        behavior: 'instant',
      });
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (frame) window.cancelAnimationFrame(frame);
    };

    const deadline = Date.now() + 5000;
    if (targetPosition.x === 0 && targetPosition.y === 0) {
      restore();
    } else {
      observer = new ResizeObserver(restore);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
      frame = window.requestAnimationFrame(restore);
      timeout = window.setTimeout(restore, 5000);
    }

    return () => {
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [location.hash, location.key, location.pathname, location.search, navigationType]);

  useLayoutEffect(() => {
    const persist = () => {
      const { key, storageKey } = currentLocation.current;
      const position = { x: window.scrollX, y: window.scrollY };
      positions.current.set(key, position);
      savePosition(storageKey, position);
    };

    window.addEventListener('scroll', persist, { passive: true });
    window.addEventListener('pagehide', persist);
    return () => {
      window.removeEventListener('scroll', persist);
      window.removeEventListener('pagehide', persist);
    };
  }, []);

  return null;
}
