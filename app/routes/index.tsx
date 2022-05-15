import { Link } from "@remix-run/react";

export default function Index() {
  return (
    <main>
      <h1>SWR Cache Example</h1>
      <p>This example uses the public Reddit API. To load some data go to any available subriddit page using `/r/[subredditName]` pattern or choose one of the examples below.</p>
      <ul>
        <li><Link to="r/webdev">webdev</Link></li>
        <li><Link to="r/javascript">JavaScript</Link></li>
        <li><Link to="r/cloudflare">Cloudflare</Link></li>
      </ul>
    </main>
  );
}
