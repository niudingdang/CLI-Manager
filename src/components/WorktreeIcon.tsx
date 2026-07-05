import type { SVGProps } from "react";

export function WorktreeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M60 120H170L195 150H450Q470 150 470 170V390Q470 410 450 410H60Q40 410 40 390V140Q40 120 60 120Z"
        fill="#F5C542"
        stroke="#2f3542"
        strokeWidth="8"
      />
      <path
        d="M256 320V255M256 255L170 185M256 255L256 185M256 255L342 185"
        stroke="#2f3542"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="256" cy="320" r="12" fill="white" stroke="#2f3542" strokeWidth="6" />
      <circle cx="170" cy="185" r="10" fill="white" stroke="#2f3542" strokeWidth="6" />
      <circle cx="256" cy="185" r="10" fill="white" stroke="#2f3542" strokeWidth="6" />
      <circle cx="342" cy="185" r="10" fill="white" stroke="#2f3542" strokeWidth="6" />
      <rect x="145" y="145" width="50" height="35" rx="6" fill="#4CAF50" stroke="#2f3542" strokeWidth="6" />
      <rect x="231" y="145" width="50" height="35" rx="6" fill="#4CAF50" stroke="#2f3542" strokeWidth="6" />
      <rect x="317" y="145" width="50" height="35" rx="6" fill="#4CAF50" stroke="#2f3542" strokeWidth="6" />
      <g transform="translate(55 345) rotate(45)">
        <rect x="0" y="0" width="70" height="70" rx="8" fill="#F05133" />
        <circle cx="20" cy="35" r="5" fill="white" />
        <circle cx="35" cy="20" r="5" fill="white" />
        <circle cx="50" cy="50" r="5" fill="white" />
        <path d="M20 35L35 20L50 50" stroke="white" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
