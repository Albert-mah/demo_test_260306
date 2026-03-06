import { useState, useEffect } from 'react';

/** Breakpoints: mobile < 768, tablet < 1024 */
export function useResponsive() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    isMobile: width < 768,
    isTablet: width < 1024,
    width,
  };
}
