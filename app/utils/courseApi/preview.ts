/**
 * Preview adapter for CourseAPI.
 *
 * This is a raw JavaScript string that gets inlined into the preview iframe's
 * <script> block. It creates `window.CourseAPI` with a console-logging,
 * localStorage-backed implementation.
 *
 * Features:
 * - Logs all calls to console with styled output
 * - Persists suspend data and location to localStorage (keyed by template ID)
 * - 20-second debounce flush for dirty state
 * - Immediate flush on complete() / fail()
 * - Accumulates statements in memory, readable via CourseAPI._statements
 * - Posts state changes to parent via postMessage for potential debug panels
 */
export const COURSE_API_PREVIEW_SCRIPT = `
(function() {
  var FLUSH_INTERVAL = 20000; // 20 seconds
  var LOG_PREFIX = '[CourseAPI]';
  var LOG_STYLE = 'color: #7458f5; font-weight: bold;';
  var LOG_STYLE_SUCCESS = 'color: #22c55e; font-weight: bold;';
  var LOG_STYLE_ERROR = 'color: #ef4444; font-weight: bold;';
  var LOG_STYLE_DIM = 'color: #94a3b8;';

  // State
  var initialized = false;
  var terminated = false;
  var completionStatus = null; // 'completed' | 'failed' | null
  var score = null;
  var progress = 0;
  var location = null;
  var suspendData = null;
  var statements = [];
  var dirty = false;
  var flushTimer = null;
  var startTime = null;

  // Storage key — uses a template ID if available, falls back to generic
  var storageKey = 'playshape-courseapi-preview';

  function log(method, args, style) {
    var s = style || LOG_STYLE;
    if (args !== undefined) {
      console.log('%c' + LOG_PREFIX + '%c ' + method, s, 'color: inherit;', args);
    } else {
      console.log('%c' + LOG_PREFIX + '%c ' + method, s, 'color: inherit;');
    }
  }

  function markDirty() {
    dirty = true;
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_INTERVAL);
  }

  function flush() {
    if (!dirty) return;
    dirty = false;
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

    var state = {
      completionStatus: completionStatus,
      score: score,
      progress: progress,
      location: location,
      suspendData: suspendData,
      statements: statements,
      sessionTime: startTime ? Math.round((Date.now() - startTime) / 1000) : 0,
      timestamp: Date.now()
    };

    // Persist to localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      // localStorage might be unavailable in sandboxed iframes
    }

    // Notify parent frame for potential debug panel
    var host = window.parent !== window ? window.parent : window.opener;
    if (host) {
      try {
        host.postMessage({ type: 'courseapi-state', state: state }, '*');
      } catch (e) {}
    }

    log('flush', state, LOG_STYLE_DIM);
  }

  function guardInitialized(method) {
    if (!initialized) {
      log(method + ' called before initialize()', undefined, LOG_STYLE_ERROR);
      return false;
    }
    if (terminated) {
      log(method + ' called after terminate()', undefined, LOG_STYLE_ERROR);
      return false;
    }
    return true;
  }

  window.CourseAPI = {
    // Expose internals for debug
    _statements: statements,
    _getState: function() {
      return {
        initialized: initialized,
        terminated: terminated,
        completionStatus: completionStatus,
        score: score,
        progress: progress,
        location: location,
        suspendData: suspendData,
        statements: statements
      };
    },

    initialize: function() {
      if (initialized && !terminated) {
        log('initialize() — already initialized, ignoring', undefined, LOG_STYLE_DIM);
        return;
      }
      initialized = true;
      terminated = false;
      startTime = Date.now();

      // Reset state for fresh session
      completionStatus = null;
      score = null;
      progress = 0;
      statements = [];
      window.CourseAPI._statements = statements;

      // Restore persisted location and suspend data
      try {
        var saved = localStorage.getItem(storageKey);
        if (saved) {
          var parsed = JSON.parse(saved);
          location = parsed.location || null;
          suspendData = parsed.suspendData || null;
        }
      } catch (e) {}

      log('initialize()', undefined, LOG_STYLE_SUCCESS);
    },

    terminate: function() {
      if (!guardInitialized('terminate')) return;
      terminated = true;

      var sessionTime = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

      // Final flush
      dirty = true;
      flush();

      if (!completionStatus) {
        log('terminate() — WARNING: activity never called complete() or fail()', undefined, LOG_STYLE_ERROR);
      }

      log('terminate() — session time: ' + sessionTime + 's, status: ' + (completionStatus || 'none') +
        ', statements: ' + statements.length, undefined, LOG_STYLE_SUCCESS);
    },

    complete: function(options) {
      if (!guardInitialized('complete')) return;
      completionStatus = 'completed';
      if (options && options.score !== undefined) {
        score = options.score;
      }
      log('complete()', options || {}, LOG_STYLE_SUCCESS);
      dirty = true;
      flush(); // Immediate flush

      // Notify parent for toast
      var host = window.parent !== window ? window.parent : window.opener;
      if (host) {
        try {
          host.postMessage({ type: 'courseapi-event', event: 'complete', score: score }, '*');
        } catch (e) {}
      }
    },

    fail: function(options) {
      if (!guardInitialized('fail')) return;
      completionStatus = 'failed';
      if (options && options.score !== undefined) {
        score = options.score;
      }
      log('fail()', options || {}, LOG_STYLE_ERROR);
      dirty = true;
      flush(); // Immediate flush

      // Notify parent for toast
      var host = window.parent !== window ? window.parent : window.opener;
      if (host) {
        try {
          host.postMessage({ type: 'courseapi-event', event: 'fail', score: score }, '*');
        } catch (e) {}
      }
    },

    setProgress: function(value) {
      if (!guardInitialized('setProgress')) return;
      progress = Math.max(0, Math.min(1, value));
      log('setProgress(' + progress + ')');
      markDirty();
    },

    setLocation: function(loc) {
      if (!guardInitialized('setLocation')) return;
      location = loc;
      log('setLocation(' + JSON.stringify(loc) + ')');
      markDirty();
    },

    getLocation: function() {
      if (!initialized) {
        log('getLocation() called before initialize()', undefined, LOG_STYLE_ERROR);
        return null;
      }
      log('getLocation() → ' + JSON.stringify(location), undefined, LOG_STYLE_DIM);
      return location;
    },

    suspend: function(data) {
      if (!guardInitialized('suspend')) return;
      suspendData = data;
      log('suspend()', data);
      markDirty();
    },

    restore: function() {
      if (!initialized) {
        log('restore() called before initialize()', undefined, LOG_STYLE_ERROR);
        return null;
      }
      log('restore() → ' + (suspendData !== null ? 'found' : 'null'), suspendData, LOG_STYLE_DIM);
      return suspendData;
    },

    record: function(statement) {
      if (!guardInitialized('record')) return;
      if (!statement.timestamp) {
        statement.timestamp = Date.now();
      }
      statements.push(statement);

      var summary = statement.verb + ' → ' + statement.object.id;
      if (statement.result) {
        if (statement.result.correct !== undefined) {
          summary += ' (' + (statement.result.correct ? 'correct' : 'incorrect') + ')';
        }
        if (statement.result.score !== undefined) {
          summary += ' score: ' + statement.result.score;
        }
      }
      log('record: ' + summary, statement);
      markDirty();

      // Notify parent for toast
      var host = window.parent !== window ? window.parent : window.opener;
      if (host) {
        try {
          host.postMessage({
            type: 'courseapi-event',
            event: 'record',
            verb: statement.verb,
            objectName: statement.object.name || statement.object.id,
            correct: statement.result ? statement.result.correct : undefined,
            score: statement.result ? statement.result.score : undefined,
            response: statement.result ? statement.result.response : undefined
          }, '*');
        } catch (e) {}
      }
    }
  };
})();
`
