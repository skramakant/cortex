'use strict';

/**
 * Unit tests for TriggerManager.gs — setupTriggers()
 *
 * Since GAS files use global scope (no exports), we load the .gs file
 * using Node's `vm` module, injecting mocked GAS globals into the context.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const { createMockScriptApp } = require('../gasGlobals');

// Path to the GAS source file under test
const TRIGGER_MANAGER_PATH = path.resolve(__dirname, '../../TriggerManager.gs');
const triggerManagerCode = fs.readFileSync(TRIGGER_MANAGER_PATH, 'utf8');

/**
 * Loads TriggerManager.gs into a fresh vm context with the provided GAS globals.
 * Returns the context so tests can call functions defined in it.
 */
function loadTriggerManager(gasGlobals) {
  const context = vm.createContext({ ...gasGlobals });
  vm.runInContext(triggerManagerCode, context);
  return context;
}

describe('setupTriggers()', () => {
  describe('when called once with no existing triggers', () => {
    it('creates exactly one trigger for runScheduler', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      ctx.setupTriggers();

      const triggers = ScriptApp.getProjectTriggers();
      expect(triggers).toHaveLength(1);
      expect(triggers[0].getHandlerFunction()).toBe('runScheduler');
    });
  });

  describe('when called multiple times (idempotency)', () => {
    it('results in exactly one trigger after two calls', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      ctx.setupTriggers();
      ctx.setupTriggers();

      const triggers = ScriptApp.getProjectTriggers();
      expect(triggers).toHaveLength(1);
    });

    it('results in exactly one trigger after five calls', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      for (let i = 0; i < 5; i++) {
        ctx.setupTriggers();
      }

      const triggers = ScriptApp.getProjectTriggers();
      expect(triggers).toHaveLength(1);
    });

    it('the single trigger is always for runScheduler regardless of call count', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      for (let i = 0; i < 3; i++) {
        ctx.setupTriggers();
      }

      const triggers = ScriptApp.getProjectTriggers();
      expect(triggers[0].getHandlerFunction()).toBe('runScheduler');
    });
  });

  describe('when a runScheduler trigger already exists before setup', () => {
    it('does not create a duplicate trigger', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      // Simulate a pre-existing trigger by calling setupTriggers once first
      ctx.setupTriggers();
      expect(ScriptApp.getProjectTriggers()).toHaveLength(1);

      // Calling again should not add another trigger
      ctx.setupTriggers();
      expect(ScriptApp.getProjectTriggers()).toHaveLength(1);
    });
  });
});

describe('removeTriggers()', () => {
  describe('when runScheduler triggers exist', () => {
    it('removes all runScheduler triggers', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      // Create two runScheduler triggers
      ctx.setupTriggers();
      // Manually add a second one by bypassing the idempotency check
      ScriptApp._triggers.push({ getHandlerFunction() { return 'runScheduler'; } });
      expect(ScriptApp.getProjectTriggers()).toHaveLength(2);

      ctx.removeTriggers();

      expect(ScriptApp.getProjectTriggers()).toHaveLength(0);
    });

    it('removes a single runScheduler trigger', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      ctx.setupTriggers();
      expect(ScriptApp.getProjectTriggers()).toHaveLength(1);

      ctx.removeTriggers();

      expect(ScriptApp.getProjectTriggers()).toHaveLength(0);
    });
  });

  describe('when no triggers exist', () => {
    it('does nothing and leaves trigger list empty', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      expect(ScriptApp.getProjectTriggers()).toHaveLength(0);

      ctx.removeTriggers();

      expect(ScriptApp.getProjectTriggers()).toHaveLength(0);
    });
  });

  describe('when triggers for other handlers exist', () => {
    it('only removes runScheduler triggers, not others', () => {
      const ScriptApp = createMockScriptApp();
      const ctx = loadTriggerManager({ ScriptApp });

      // Add a non-runScheduler trigger manually
      ScriptApp._triggers.push({ getHandlerFunction() { return 'someOtherFunction'; } });
      // Add a runScheduler trigger
      ctx.setupTriggers();
      expect(ScriptApp.getProjectTriggers()).toHaveLength(2);

      ctx.removeTriggers();

      const remaining = ScriptApp.getProjectTriggers();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].getHandlerFunction()).toBe('someOtherFunction');
    });
  });
});
