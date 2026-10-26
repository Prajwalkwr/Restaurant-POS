export default function SiteFlourish() {
  return (
    <div aria-hidden="true" className="site-flourish">
      <svg className="site-flourish__leaves site-flourish__leaves--top-left" viewBox="0 0 150 120">
        <path d="M4 0C44 9 69 34 79 72 45 65 18 42 4 0Z" fill="#6eaa76" />
        <path d="M4 0C31 30 52 51 79 72" fill="none" stroke="#477b54" strokeWidth="2" />
        <path d="M45 0C78 9 102 31 111 65 81 58 57 37 45 0Z" fill="#91bb82" />
        <path d="M45 0C70 24 90 45 111 65" fill="none" stroke="#5d8d60" strokeWidth="2" />
        <path d="M91 1C119 9 139 28 147 55 122 49 101 31 91 1Z" fill="#b5ce96" />
      </svg>
      <svg className="site-flourish__leaves site-flourish__leaves--top-right" viewBox="0 0 150 120">
        <path d="M146 0C106 9 81 34 71 72 105 65 132 42 146 0Z" fill="#6eaa76" />
        <path d="M146 0C119 30 98 51 71 72" fill="none" stroke="#477b54" strokeWidth="2" />
        <path d="M105 0C72 9 48 31 39 65 69 58 93 37 105 0Z" fill="#91bb82" />
        <path d="M105 0C80 24 60 45 39 65" fill="none" stroke="#5d8d60" strokeWidth="2" />
        <path d="M59 1C31 9 11 28 3 55 28 49 49 31 59 1Z" fill="#b5ce96" />
      </svg>
      <svg className="site-flourish__leaves site-flourish__leaves--bottom-left" viewBox="0 0 180 140">
        <path d="M0 136C14 88 47 53 96 40 87 84 53 119 0 136Z" fill="#477e58" />
        <path d="M0 136C34 100 63 69 96 40" fill="none" stroke="#356848" strokeWidth="2" />
        <path d="M1 86C24 47 60 21 105 14 89 52 54 78 1 86Z" fill="#83ae78" />
        <path d="M1 86C39 60 71 35 105 14" fill="none" stroke="#56855e" strokeWidth="2" />
        <path d="M6 41C29 16 57 3 91 0 72 26 44 39 6 41Z" fill="#b4ca91" />
      </svg>
      <svg className="site-flourish__plate" viewBox="0 0 360 360">
        <defs>
          <radialGradient id="site-plate" cx="42%" cy="36%">
            <stop offset="0%" stopColor="#fffef8" />
            <stop offset="72%" stopColor="#f2eee1" />
            <stop offset="100%" stopColor="#d9d2bd" />
          </radialGradient>
          <radialGradient id="site-food" cx="42%" cy="38%">
            <stop offset="0%" stopColor="#e5a744" />
            <stop offset="60%" stopColor="#b9672d" />
            <stop offset="100%" stopColor="#6b7136" />
          </radialGradient>
        </defs>
        <circle cx="180" cy="180" r="174" fill="#d6d3c5" opacity=".55" />
        <circle cx="180" cy="180" r="162" fill="url(#site-plate)" />
        <circle cx="180" cy="180" r="119" fill="#fffdf5" stroke="#e5deca" strokeWidth="2" />
        <path d="M91 169c9-39 48-67 88-61 18-25 63-12 66 18 29 13 33 54 7 71-2 36-39 53-68 34-34 14-71-6-71-39-22-1-33-8-22-23Z" fill="url(#site-food)" />
        <g fill="#d4a83c">
          <circle cx="136" cy="142" r="10" /><circle cx="180" cy="129" r="9" /><circle cx="219" cy="151" r="11" />
          <circle cx="119" cy="183" r="8" /><circle cx="162" cy="177" r="12" /><circle cx="204" cy="190" r="9" />
          <circle cx="143" cy="213" r="9" /><circle cx="190" cy="222" r="10" /><circle cx="232" cy="194" r="7" />
        </g>
        <g fill="#63844c">
          <path d="M157 151c-15-17-29-15-34-11 8 15 19 19 34 11Z" /><path d="M194 161c13-20 28-19 35-15-7 16-19 22-35 15Z" />
          <path d="M129 199c-17-14-30-9-34-3 12 12 23 14 34 3Z" /><path d="M211 211c12-17 27-16 33-11-8 14-20 19-33 11Z" />
          <path d="M177 196c-10-19-4-31 3-34 9 15 9 26-3 34Z" />
        </g>
        <g fill="#efeadb" opacity=".9">
          <circle cx="155" cy="164" r="4" /><circle cx="217" cy="174" r="4" /><circle cx="174" cy="211" r="4" />
        </g>
      </svg>
    </div>
  );
}
