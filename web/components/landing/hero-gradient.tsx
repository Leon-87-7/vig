'use client';

import { GrainGradient } from '@paper-design/shaders-react';
import { useEffect, useState } from 'react';

export function HeroGradient() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <GrainGradient
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      width="100%"
      height="100%"
      // ponytail: cap the render budget — grain hides the resolution loss,
      // and uncapped retina canvases wedge machines on software WebGL.
      minPixelRatio={1}
      maxPixelCount={1_000_000}
      colors={['#353b45', '#a77735', '#efb667', '#9ecaff', '#649ba0']}
      colorBack="#0e0f11"
      softness={1}
      intensity={0.64}
      noise={0.22}
      shape="corners"
      speed={reduced ? 0 : 1}
      rotation={172}
    />
  );
}
