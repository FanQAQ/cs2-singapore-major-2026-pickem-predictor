/* These switches are selected separately for each method using completed, earlier Majors. */
(() => {
  'use strict';
  function defaults(method, event) {
    const tree = method === 'tree' || method === 'boost';
    if (!tree && method !== 'recommended' && method !== 'v4') throw Error('无法识别的预测模型');
    const key = tree ? 'tree' : 'recommended';
    const selected = event?.methodSelection?.[key] ?? 'base';
    if (!['base','pick','lan','both'].includes(selected)) throw Error('无效的赛前特征组合');
    const flags = tree
      ? {family:'boost', form:true, strong:true, weak:true, format:true, shrinkBO:true}
      : {...PickV4.preset, regionVrs:true};
    flags.lanSignal = selected === 'lan' || selected === 'both';
    flags.pickSignal = selected === 'pick' || selected === 'both';
    return flags;
  }

  globalThis.PickMethods = {defaults};
})();
