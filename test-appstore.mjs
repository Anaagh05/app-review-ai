import store from 'app-store-scraper';

const results = await store.reviews({
  id: 1404684361,  // Groww
  country: 'in',
  sort: store.sort.RECENT,
  page: 1,
});

console.log(`Got ${results.length} reviews`);
if (results.length > 0) {
  const r = results[0];
  console.log('Sample:', { title: r.title, score: r.score, date: r.updated, body: r.text?.slice(0, 80) });
}
