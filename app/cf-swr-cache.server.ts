// some credit for the base structure goes to Jacob Ebey who implemented a similar cache using redis (see: https://github.com/jacob-ebey/remix-ecommerce/tree/main/app)

export interface RequestResponseCache {
  (request: Request, maxAgeSeconds: number): Promise<Response>;
}

const YEAR_AGE = 31556926

// a small hash function to hash a string using the worker compatible crypto engine
async function sha256(message: string) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message);

  // hash the message
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // convert bytes to hex string
  const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
  return hashHex;
}

export const createSwrCfCache = (event: FetchEvent): RequestResponseCache => {
  return async (request, maxAgeSeconds) => {
    // we get the default cache from the worker you could also grab a dedicated cache here
    // @ts-expect-error
    const cache: Cache = caches.default

    // next various parameters from the request are used to create a unique hash for the request
    const method = request.method.toLowerCase()

    let hashText = ""
    hashText += method
    hashText += request.url
    for (const header of request.headers) {
      hashText += header[0]
      hashText += header[1]
    }
    let body: string | null = null
    if (method !== "get" && method !== "head" && request.body) {
      body = await request.clone().text()
    }
    if (typeof body === "string") {
      hashText += body
    }
    const key = await sha256(hashText) // here we actually generate a hash out of our string


    // next we create two new requests which we will then later cache with the workers Cache API //TODO link

    // the first Request we will cache contains the actual response and data that will be cached
    // this is created as a GET Request because the Cache API only supports GET requests
    const responseKeyUrl = new URL(request.url)
    responseKeyUrl.pathname = `/posts/swr:request:${key}`
    const responseKey = new Request(responseKeyUrl.toString(), {
      method: "GET",
    })

    // the second Request is for the SWR duration value, this ensures and let's us check weather the cache should be revalidated 
    const stillGoodKeyUrl = new URL(request.url)
    stillGoodKeyUrl.pathname = `/posts/swr:stillgood:${key}`
    const stillGoodKey = new Request(stillGoodKeyUrl.toString(), {
      method: "GET",
    })

    // this promise let's us check weather the cache should be revalidated using the stillGoodKey which is set via the Cache API
    const cachedStillGoodPromise = cache.match(stillGoodKey)
      .then((cachedStillGood) => {
        if (!cachedStillGood) {
          return false
        }
        return true
      })
      .catch(() => false)

    // here we will try to get the actual data from the Cache API
    // if there is no cached value the response will not be set and then actually fetched and stored later
    let response = await cache.match(responseKey).then(async (cachedResponse) => {
      if (!cachedResponse) {
        return null
      }

      cachedResponse = new Response(cachedResponse?.body, cachedResponse)

      if (await cachedStillGoodPromise) {
        // the cached value is still up to data and not stale so there is no need to refetch the data
        cachedResponse.headers.set("X-SWR-Cache", "hit")
      } else {
        // here the cached value is stale, it still be delivered stale but revalidated in the background
        cachedResponse.headers.set("X-SWR-Cache", "stale")

        // this function will refetch the data and update both the result cache entry as well as the stillGood entry
        async function saveCache() {
          let responseToCache = await fetch(request.clone());
          responseToCache = new Response(responseToCache.body, {
            headers: {
              "Cache-Control": `max-age=${YEAR_AGE}`
            }
          })
          if (responseToCache.status === 200) {
            await cache.put(responseKey, responseToCache.clone());
            await cache.put(stillGoodKey, new Response(null, {
              headers: {
                "cache-control": `max-age=${maxAgeSeconds}`
              }
            }));
          }
          return null
        }

        // we call the saveCache function with `event.waitUntil` to make sure the worker runs until it is funished 
        // but also respond to our request as fast as possible
        event.waitUntil(saveCache())
      }
      return cachedResponse

    }).catch((e) => {
      console.log("ERROR")
      console.error(e)
    })

    if (!response) {
      // if we are here no cached response could be found so we need to initially fetch and store the data
      response = await fetch(request.clone())
      response = new Response(response.body, {
        headers: {
          "X-SWR-Cache": "miss",
          "Cache-Control": `max-age=${YEAR_AGE}`
        }
      })

      if (response !== null && response.status === 200) {
        // this function will fetch the data and set both the result cache entry as well as the stillGood entry
        async function saveCache(response: Response) {
          await cache.put(responseKey, response.clone());
          await cache.put(stillGoodKey, new Response(null, {
            headers: {
              "cache-control": `max-age=${maxAgeSeconds}`
            }
          }));
          return null
        }
        // we call the saveCache function with `event.waitUntil` to make sure the worker runs until it is funished 
        // but also respond to our request as fast as possible
        event.waitUntil(saveCache(response))
      }
    }
    return response
  };
};
