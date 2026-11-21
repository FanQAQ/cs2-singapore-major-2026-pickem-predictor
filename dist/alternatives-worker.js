'use strict';
importScripts('engine.js', 'card-alternatives.js');
self.onmessage = async ({data}) => {
  try { self.postMessage({counts:await self.PickAlternatives.sample(data, false)}); }
  catch (error) { self.postMessage({error:error.message}); }
};
