export function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        stroke="#E1306C"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="4.5" stroke="#E1306C" strokeWidth="2" />
      <circle cx="17.3" cy="6.7" r="1.3" fill="#E1306C" />
    </svg>
  );
}
