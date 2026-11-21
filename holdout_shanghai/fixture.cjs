'use strict';
const {forStage} = require('../holdout_copenhagen/fixture.cjs');
module.exports = forStage('shanghai', require('./field.json'));
