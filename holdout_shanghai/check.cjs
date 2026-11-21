'use strict';
const {checkBaseline} = require('../holdout_copenhagen/check.cjs');
checkBaseline(require('./fixture.cjs'), __dirname);
