import Link from "next/link";
export default function NotFound(){return <div className="not-found"><span>404</span><h1>That dart missed the board.</h1><p>The page isn’t in play, but your next match can be.</p><Link className="button-link" href="/">Return home</Link></div>}
