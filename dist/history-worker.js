'use strict';
importScripts('engine.js','data.js','format.js','style-model.js','rolling.js','boost.js','v4.js','map-model.js','close-model.js','region-risk.js','region-vrs.js','major-form.js','robust-card.js','pick-signal.js','lan-signal.js','methods.js','stage-inputs.js','stage-training.js','stage3-card.js','adapter.js','history.js');
self.onmessage = ({data:{request,flags,ids}}) => {
  try {
    for (const id of ids) {
      const row = PickHistory.scoreEvent(id,flags);
      self.postMessage({request,row});
    }
    self.postMessage({request,done:true});
  } catch(error) {
    self.postMessage({request,error:String(error.message || error)});
  }
};
