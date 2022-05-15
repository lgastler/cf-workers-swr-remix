import { useLoaderData } from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import type { RequestResponseCache } from "~/cf-swr-cache.server";

export const loader: LoaderFunction = async ({ params, context, request }) => {
  const { cache } = context as { cache: RequestResponseCache }
  const { subredditId } = params
  const url = new URL(request.url);
  const noCache = url.searchParams.has("no-cache");

  const reddirRequest = new Request(`https://www.reddit.com/r/${subredditId}/top.json?limit=10&t=year`)

  const data = noCache ? await fetch(reddirRequest) : await cache(reddirRequest, 6000)

  const jsonData = await data.json() as any
  if (!jsonData.data.children) {
    throw new Response(null, {
      status: 404
    })
  }
  return json(jsonData)
}

export default function Index() {
  const loaderData = useLoaderData()
  return (
    <main>
      <h1>{loaderData.data.children[0].data.subreddit} posts</h1>
      <ul>
        {loaderData.data.children.map((item: any) => (
          <li key={item.data.id}><a href={item.data.url} target="_blank" rel="noreferrer">{item.data.title}</a></li>
        ))}
      </ul>
    </main>
  );
}
