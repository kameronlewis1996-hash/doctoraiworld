'use strict';

const localRuleEngine = require('./safety-engine.cjs');

const MEDICATION_SAFETY_PROVIDER_INTERFACE_VERSION = 1;

function createMedicationSafetyProvider({ id = 'doctorai-local-rule-engine', version = '1', review } = {}) {
  if (typeof review !== 'function') throw new TypeError('A medication safety provider must implement review(input).');
  return Object.freeze({
    id,
    version,
    interfaceVersion: MEDICATION_SAFETY_PROVIDER_INTERFACE_VERSION,
    async review(input) {
      return review(input);
    }
  });
}

const defaultMedicationSafetyProvider = createMedicationSafetyProvider({
  id: 'doctorai-local-pharmac-rules',
  version: localRuleEngine.review({ medications: [] }).ruleset?.version || 'local-rules-v1',
  review: input => localRuleEngine.review(input)
});

module.exports = { MEDICATION_SAFETY_PROVIDER_INTERFACE_VERSION, createMedicationSafetyProvider, defaultMedicationSafetyProvider };
