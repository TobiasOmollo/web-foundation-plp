# Reflection

## The most difficult concept

Load balancing and latency were the hardest for me, and honestly, I'm still green on both. At first I thought a load balancer was just a box that spreads traffic around, and that latency simply meant "how fast the site is." Neither turned out to be that simple. I couldn't see why adding more servers didn't automatically make things faster, or why a page could feel slow even when the servers weren't busy.

What helped was working with real numbers. Turning 50 million feed views a day into about 579 requests per second made load feel concrete instead of abstract. Drawing the path of a single request, step by step, showed me where the waiting actually happens: the network, the cache, the database. I'm not fully there yet, but I can now explain in my own words why a CDN, a cache and a load balancer each exist.

## What I would improve

Based on the feedback I received, the part of my capstone I would improve is how I justify my choices. I listed the components, but I didn't always explain why each was needed, what happens when one fails, or what latency I was aiming for. Next time I would set clear targets, such as "the seat map loads in under 500 ms," and explain how each component helps meet them.

## What I will learn next

I want to learn how load balancers actually pick a server (round robin, least connections) and how health checks work. I also want to understand latency properly, including percentiles like p95, so I can measure it instead of guessing. Finally, I'd like to build a small project and load test it, because I learn best by watching something break and then fixing it.
