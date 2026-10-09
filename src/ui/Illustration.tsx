// Flat, two-tone illustration: a head with a phone held landscape on the
// forehead, plus the two tilt directions. Plain shapes, no art assets.
export function HeadIllustration({ fg, bg }: { fg: string; bg: string }) {
  return (
    <svg class="pre-illo" viewBox="0 0 260 180" role="img" aria-label="Phone held sideways on a forehead">
      {/* shoulders + head */}
      <path d="M40 180c0-34 34-46 90-46s90 12 90 46z" fill={fg} opacity="0.28" />
      <circle cx="130" cy="96" r="44" fill={fg} opacity="0.28" />
      {/* phone, landscape, screen facing out */}
      <g transform="rotate(-4 130 62)">
        <rect x="76" y="34" width="108" height="56" rx="10" fill={fg} />
        <rect x="83" y="40" width="94" height="44" rx="5" fill={bg} />
        <rect x="100" y="56" width="60" height="12" rx="2" fill={fg} />
      </g>
      {/* tilt arrows */}
      <g fill="none" stroke={fg} stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M206 50c14 8 20 20 18 34" />
        <path d="M216 78l8 8 6-10" />
        <path d="M54 74c-14-8-20-20-18-34" />
        <path d="M44 46l-8-8-6 10" />
      </g>
    </svg>
  );
}
