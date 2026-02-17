/**
 * SCORM CourseAPI Adapter
 *
 * This module generates a raw JavaScript string that creates `window.CourseAPI`
 * backed by scorm-again. This replaces the preview adapter in exported SCORM packages.
 *
 * The adapter handles:
 * - SCORM 1.2 and SCORM 2004 via scorm-again
 * - Per-activity state tracking within a single-SCO package
 * - Suspend data compression for SCORM 1.2's 4096-char limit
 * - Statement → cmi.interactions mapping
 * - Session time calculation
 * - Course-level completion rollup
 */

import { compressToBase64, decompressFromBase64 } from 'lz-string'

export type ScormVersion = 'scorm-1.2' | 'scorm-2004'

/**
 * Returns the raw JS source for lz-string compress/decompress functions.
 * We inline a minimal subset (~3KB) rather than the full library.
 */
function getLzStringSource(): string {
  // We'll use a minified inline version of lz-string's compressToBase64/decompressFromBase64
  // For now, we'll generate the full source in the build step
  // This is a placeholder that will be replaced with the actual minified lz-string
  return `
// LZ-String compression (MIT License - Copyright (c) 2013 pieroxy)
// Minified compressToBase64 and decompressFromBase64 only
var LZString=function(){function o(o,r){if(!t[o]){t[o]={};for(var n=0;n<o.length;n++)t[o][o.charAt(n)]=n}return t[o][r]}var r=String.fromCharCode,n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",t={},i={compressToBase64:function(o){if(null==o)return"";var r=i._compress(o,6,function(o){return n.charAt(o)});switch(r.length%4){default:case 0:return r;case 1:return r+"===";case 2:return r+"==";case 3:return r+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(e){return o(n,r.charAt(e))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(o){return null==o?"":""==o?null:i._decompress(o.length,16384,function(r){return o.charCodeAt(r)-32})},compressToUint8Array:function(o){for(var r=i.compress(o),n=new Uint8Array(2*r.length),e=0,t=r.length;t>e;e++){var s=r.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null===o||void 0===o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;t>e;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(o){return null==o?"":i._compress(o,6,function(o){return e.charAt(o)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(n){return o(e,r.charAt(n))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(o,r,n){if(null==o)return"";var e,t,i,s={},p={},u="",c="",a="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<o.length;i+=1)if(u=o.charAt(i),Object.prototype.hasOwnProperty.call(s,u)||(s[u]=f++,p[u]=!0),c=a+u,Object.prototype.hasOwnProperty.call(s,c))a=c;else{if(Object.prototype.hasOwnProperty.call(p,a)){if(a.charCodeAt(0)<256){for(e=0;h>e;e++)m<<=1,v==r-1?(v=0,d.push(n(m)),m=0):v++;for(t=a.charCodeAt(0),e=0;8>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;h>e;e++)m=m<<1|t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=a.charCodeAt(0),e=0;16>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}l--,0==l&&(l=Math.pow(2,h),h++),delete p[a]}else for(t=s[a],e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;l--,0==l&&(l=Math.pow(2,h),h++),s[c]=f++,a=String(u)}if(""!==a){if(Object.prototype.hasOwnProperty.call(p,a)){if(a.charCodeAt(0)<256){for(e=0;h>e;e++)m<<=1,v==r-1?(v=0,d.push(n(m)),m=0):v++;for(t=a.charCodeAt(0),e=0;8>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;h>e;e++)m=m<<1|t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=a.charCodeAt(0),e=0;16>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}l--,0==l&&(l=Math.pow(2,h),h++),delete p[a]}else for(t=s[a],e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;l--,0==l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==r-1){d.push(n(m));break}v++}return d.join("")},decompress:function(o){return null==o?"":""==o?null:i._decompress(o.length,32768,function(r){return o.charCodeAt(r)})},_decompress:function(o,n,e){var t,i,s,p,u,c,a,l,f=[],h=4,d=4,m=3,v="",w=[],A={val:e(0),position:n,index:1};for(i=0;3>i;i+=1)f[i]=i;for(p=0,c=Math.pow(2,2),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;switch(t=p){case 0:for(p=0,c=Math.pow(2,8),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;l=r(p);break;case 1:for(p=0,c=Math.pow(2,16),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;l=r(p);break;case 2:return""}for(f[3]=l,s=l,w.push(l);;){if(A.index>o)return"";for(p=0,c=Math.pow(2,m),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;switch(l=p){case 0:for(p=0,c=Math.pow(2,8),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;f[d++]=r(p),l=d-1,h--;break;case 1:for(p=0,c=Math.pow(2,16),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;f[d++]=r(p),l=d-1,h--;break;case 2:return w.join("")}if(0==h&&(h=Math.pow(2,m),m++),f[l])v=f[l];else{if(l!==d)return null;v=s+s.charAt(0)}w.push(v),f[d++]=s+v.charAt(0),h--,s=v,0==h&&(h=Math.pow(2,m),m++)}}};return i}();"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module&&(module.exports=LZString);
`
}

/**
 * Generates the SCORM CourseAPI adapter script.
 *
 * This is a raw JavaScript string that will be inlined into the exported HTML.
 * It creates `window.CourseAPI` backed by scorm-again and handles:
 * - Per-activity state tracking
 * - Course-level completion rollup
 * - Suspend data compression
 * - Statement → interaction mapping
 */
export function generateScormCourseApiScript(version: ScormVersion): string {
  const isScorm12 = version === 'scorm-1.2'

  return `
${getLzStringSource()}

(function() {
  'use strict';

  var SCORM_VERSION = '${version}';
  var IS_SCORM_12 = ${isScorm12};

  // ── SCORM API Discovery ─────────────────────────────────────────────────────
  // Find the LMS-provided SCORM API object
  function findAPI(win) {
    var findAttempts = 0;
    var maxAttempts = 500;

    while (win && !win.API && !win.API_1484_11 && win.parent && win.parent !== win && findAttempts < maxAttempts) {
      findAttempts++;
      win = win.parent;
    }

    if (IS_SCORM_12) {
      return win.API || null;
    } else {
      return win.API_1484_11 || null;
    }
  }

  function getAPI() {
    var api = findAPI(window);
    if (!api && window.opener) {
      api = findAPI(window.opener);
    }
    return api;
  }

  // ── State Management ────────────────────────────────────────────────────────
  var scormApi = null;
  var initialized = false;
  var terminated = false;
  var startTime = null;

  // Current activity being tracked
  var currentActivityId = null;

  // Per-activity state map: { [activityId]: { status, score, suspendData, location, statements } }
  var activityStates = {};

  // Course-level state
  var courseState = {
    currentSection: 0,
    currentActivity: 0
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function log(msg, data) {
    if (typeof console !== 'undefined' && console.log) {
      if (data !== undefined) {
        console.log('[CourseAPI:SCORM] ' + msg, data);
      } else {
        console.log('[CourseAPI:SCORM] ' + msg);
      }
    }
  }

  function logError(msg, data) {
    if (typeof console !== 'undefined' && console.error) {
      if (data !== undefined) {
        console.error('[CourseAPI:SCORM] ' + msg, data);
      } else {
        console.error('[CourseAPI:SCORM] ' + msg);
      }
    }
  }

  // Format seconds as ISO 8601 duration (SCORM 2004) or HH:MM:SS (SCORM 1.2)
  function formatTime(seconds) {
    if (IS_SCORM_12) {
      var h = Math.floor(seconds / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      var s = Math.floor(seconds % 60);
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    } else {
      // ISO 8601 duration: PT#H#M#S
      var h = Math.floor(seconds / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      var s = Math.round((seconds % 60) * 100) / 100;
      var duration = 'PT';
      if (h > 0) duration += h + 'H';
      if (m > 0) duration += m + 'M';
      if (s > 0 || duration === 'PT') duration += s + 'S';
      return duration;
    }
  }

  // ── SCORM Value Getters/Setters ─────────────────────────────────────────────
  function getValue(element) {
    if (!scormApi) return '';
    try {
      if (IS_SCORM_12) {
        return scormApi.LMSGetValue(element) || '';
      } else {
        return scormApi.GetValue(element) || '';
      }
    } catch (e) {
      logError('GetValue failed: ' + element, e);
      return '';
    }
  }

  function setValue(element, value) {
    if (!scormApi) return false;
    try {
      if (IS_SCORM_12) {
        return scormApi.LMSSetValue(element, value) === 'true';
      } else {
        return scormApi.SetValue(element, value) === 'true';
      }
    } catch (e) {
      logError('SetValue failed: ' + element + ' = ' + value, e);
      return false;
    }
  }

  function commit() {
    if (!scormApi) return false;
    try {
      if (IS_SCORM_12) {
        return scormApi.LMSCommit('') === 'true';
      } else {
        return scormApi.Commit('') === 'true';
      }
    } catch (e) {
      logError('Commit failed', e);
      return false;
    }
  }

  // ── Suspend Data (Compressed) ───────────────────────────────────────────────
  function saveSuspendData() {
    var data = {
      v: 1, // version for future migrations
      course: courseState,
      activities: activityStates
    };

    var json = JSON.stringify(data);
    var compressed = LZString.compressToBase64(json);

    // SCORM 1.2 has a 4096-char limit; SCORM 2004 has 64KB
    var maxLen = IS_SCORM_12 ? 4096 : 64000;
    if (compressed.length > maxLen) {
      logError('Suspend data exceeds limit: ' + compressed.length + ' > ' + maxLen);
      // Truncate older activity states if needed (keep current + most recent)
      // For now, just warn — a smarter pruning strategy could be added
    }

    var element = IS_SCORM_12 ? 'cmi.suspend_data' : 'cmi.suspend_data';
    setValue(element, compressed);
  }

  function loadSuspendData() {
    var element = IS_SCORM_12 ? 'cmi.suspend_data' : 'cmi.suspend_data';
    var compressed = getValue(element);

    if (!compressed) {
      log('No suspend data found');
      return;
    }

    try {
      var json = LZString.decompressFromBase64(compressed);
      if (!json) {
        log('Failed to decompress suspend data');
        return;
      }

      var data = JSON.parse(json);
      if (data.v === 1) {
        courseState = data.course || courseState;
        activityStates = data.activities || {};
        log('Restored suspend data', { course: courseState, activityCount: Object.keys(activityStates).length });
      }
    } catch (e) {
      logError('Failed to parse suspend data', e);
    }
  }

  // ── Activity State Management ───────────────────────────────────────────────
  function getCurrentActivityState() {
    if (!currentActivityId) return null;
    if (!activityStates[currentActivityId]) {
      activityStates[currentActivityId] = {
        status: 'incomplete',
        score: null,
        suspendData: null,
        location: null,
        statements: []
      };
    }
    return activityStates[currentActivityId];
  }

  function setCurrentActivity(activityId) {
    currentActivityId = activityId;
    log('Switched to activity: ' + activityId);
  }

  // ── Course Completion Rollup ────────────────────────────────────────────────
  function calculateCourseCompletion() {
    var totalActivities = window.__PLAYSHAPE_COURSE__ ? countActivities() : 1;
    var completedCount = 0;
    var totalScore = 0;
    var scoredCount = 0;

    for (var id in activityStates) {
      var state = activityStates[id];
      if (state.status === 'completed' || state.status === 'passed' || state.status === 'failed') {
        completedCount++;
      }
      if (state.score !== null) {
        totalScore += state.score;
        scoredCount++;
      }
    }

    return {
      completed: completedCount >= totalActivities,
      completedCount: completedCount,
      totalActivities: totalActivities,
      averageScore: scoredCount > 0 ? totalScore / scoredCount : null
    };
  }

  function countActivities() {
    var count = 0;
    var course = window.__PLAYSHAPE_COURSE__;
    if (course && course.sections) {
      for (var i = 0; i < course.sections.length; i++) {
        count += (course.sections[i].activities || []).length;
      }
    }
    return count || 1;
  }

  function updateCourseStatus() {
    var completion = calculateCourseCompletion();

    // Set progress measure (SCORM 2004 only)
    if (!IS_SCORM_12) {
      var progress = completion.totalActivities > 0
        ? completion.completedCount / completion.totalActivities
        : 0;
      setValue('cmi.progress_measure', progress.toFixed(2));
    }

    // Set score if we have one
    if (completion.averageScore !== null) {
      if (IS_SCORM_12) {
        setValue('cmi.core.score.raw', Math.round(completion.averageScore * 100));
        setValue('cmi.core.score.min', '0');
        setValue('cmi.core.score.max', '100');
      } else {
        setValue('cmi.score.scaled', completion.averageScore.toFixed(2));
        setValue('cmi.score.raw', Math.round(completion.averageScore * 100));
        setValue('cmi.score.min', '0');
        setValue('cmi.score.max', '100');
      }
    }

    // Set completion status
    if (completion.completed) {
      if (IS_SCORM_12) {
        // SCORM 1.2: lesson_status is combined completion + success
        var status = completion.averageScore !== null && completion.averageScore >= 0.7 ? 'passed' : 'completed';
        setValue('cmi.core.lesson_status', status);
      } else {
        // SCORM 2004: separate completion and success status
        setValue('cmi.completion_status', 'completed');
        if (completion.averageScore !== null) {
          setValue('cmi.success_status', completion.averageScore >= 0.7 ? 'passed' : 'failed');
        }
      }
    }

    commit();
  }

  // ── Interactions (Statements) ───────────────────────────────────────────────
  var interactionCount = 0;

  function recordInteraction(statement) {
    var idx = interactionCount++;
    var prefix = IS_SCORM_12 ? 'cmi.interactions.' + idx : 'cmi.interactions.' + idx;

    // Set interaction ID
    setValue(prefix + '.id', statement.object.id);

    // Set type based on verb
    var typeMap = {
      'answered': 'fill-in',
      'chose': 'choice',
      'matched': 'matching',
      'sequenced': 'sequencing',
      'rated': 'likert',
      'attempted': 'other',
      'experienced': 'other',
      'commented': 'long-fill-in'
    };
    var interactionType = typeMap[statement.verb] || 'other';
    setValue(prefix + '.type', interactionType);

    // Set timestamp (SCORM 2004 only for interactions)
    if (!IS_SCORM_12 && statement.timestamp) {
      var d = new Date(statement.timestamp);
      setValue(prefix + '.timestamp', d.toISOString());
    }

    // Set result fields
    if (statement.result) {
      if (statement.result.response !== undefined) {
        setValue(prefix + (IS_SCORM_12 ? '.student_response' : '.learner_response'), String(statement.result.response));
      }
      if (statement.result.correct !== undefined) {
        setValue(prefix + '.result', statement.result.correct ? 'correct' : 'incorrect');
      }
      if (statement.result.duration !== undefined) {
        setValue(prefix + '.latency', formatTime(statement.result.duration));
      }
      if (statement.result.score !== undefined) {
        setValue(prefix + '.weighting', '1');
      }
    }

    // Set description/name if available
    if (statement.object.name) {
      if (IS_SCORM_12) {
        // SCORM 1.2 doesn't have description, but we can use objectives
        setValue(prefix + '.objectives.0.id', statement.object.id);
      } else {
        setValue(prefix + '.description.en-US', statement.object.name);
      }
    }
  }

  // ── Auto-initialize helper ──────────────────────────────────────────────────
  function ensureInitialized() {
    if (!initialized) {
      window.CourseAPI.initialize();
    }
    return !terminated;
  }

  // ── CourseAPI Implementation ────────────────────────────────────────────────
  window.CourseAPI = {
    // Debug access
    _getState: function() {
      return {
        initialized: initialized,
        terminated: terminated,
        currentActivityId: currentActivityId,
        courseState: courseState,
        activityStates: activityStates
      };
    },
    _setCurrentActivity: setCurrentActivity,

    initialize: function() {
      if (initialized && !terminated) {
        log('Already initialized');
        return;
      }

      scormApi = getAPI();
      if (!scormApi) {
        logError('SCORM API not found! Running in standalone mode.');
        initialized = true;
        startTime = Date.now();
        return;
      }

      try {
        var result = IS_SCORM_12 ? scormApi.LMSInitialize('') : scormApi.Initialize('');
        if (result === 'true' || result === true) {
          log('SCORM initialized successfully');
          initialized = true;
          terminated = false;
          startTime = Date.now();

          // Load any existing suspend data
          loadSuspendData();

          // Set initial status to incomplete if not already set
          var currentStatus = IS_SCORM_12
            ? getValue('cmi.core.lesson_status')
            : getValue('cmi.completion_status');

          if (!currentStatus || currentStatus === 'not attempted') {
            if (IS_SCORM_12) {
              setValue('cmi.core.lesson_status', 'incomplete');
            } else {
              setValue('cmi.completion_status', 'incomplete');
            }
          }

          commit();
        } else {
          var errorCode = IS_SCORM_12 ? scormApi.LMSGetLastError() : scormApi.GetLastError();
          logError('SCORM Initialize failed with error: ' + errorCode);
        }
      } catch (e) {
        logError('SCORM Initialize threw exception', e);
      }
    },

    terminate: function() {
      if (!initialized) {
        logError('terminate() called before initialize()');
        return;
      }
      if (terminated) {
        log('Already terminated');
        return;
      }

      // Save session time
      if (startTime) {
        var sessionSeconds = Math.round((Date.now() - startTime) / 1000);
        if (IS_SCORM_12) {
          setValue('cmi.core.session_time', formatTime(sessionSeconds));
        } else {
          setValue('cmi.session_time', formatTime(sessionSeconds));
        }
      }

      // Final suspend data save
      saveSuspendData();

      // Update course-level status
      updateCourseStatus();

      // Set exit to suspend (allows resume)
      if (IS_SCORM_12) {
        setValue('cmi.core.exit', 'suspend');
      } else {
        setValue('cmi.exit', 'suspend');
      }

      commit();

      // Terminate SCORM session
      if (scormApi) {
        try {
          var result = IS_SCORM_12 ? scormApi.LMSFinish('') : scormApi.Terminate('');
          if (result === 'true' || result === true) {
            log('SCORM terminated successfully');
          } else {
            var errorCode = IS_SCORM_12 ? scormApi.LMSGetLastError() : scormApi.GetLastError();
            logError('SCORM Terminate failed with error: ' + errorCode);
          }
        } catch (e) {
          logError('SCORM Terminate threw exception', e);
        }
      }

      terminated = true;
    },

    complete: function(options) {
      ensureInitialized();
      if (terminated) {
        logError('complete() called after terminate()');
        return;
      }

      var state = getCurrentActivityState();
      if (state) {
        state.status = 'completed';
        if (options && options.score !== undefined) {
          state.score = Math.max(0, Math.min(1, options.score));
        }
      }

      log('Activity completed', { activityId: currentActivityId, score: options ? options.score : undefined });

      // Save and update course status
      saveSuspendData();
      updateCourseStatus();

      // Dispatch event for interface template
      window.dispatchEvent(new CustomEvent('playshape:activity-completed', {
        detail: { activityId: currentActivityId, score: options ? options.score : undefined }
      }));
    },

    fail: function(options) {
      ensureInitialized();
      if (terminated) {
        logError('fail() called after terminate()');
        return;
      }

      var state = getCurrentActivityState();
      if (state) {
        state.status = 'failed';
        if (options && options.score !== undefined) {
          state.score = Math.max(0, Math.min(1, options.score));
        }
      }

      log('Activity failed', { activityId: currentActivityId, score: options ? options.score : undefined });

      // Save and update course status
      saveSuspendData();
      updateCourseStatus();

      // Dispatch event for interface template
      window.dispatchEvent(new CustomEvent('playshape:activity-completed', {
        detail: { activityId: currentActivityId, score: options ? options.score : undefined, failed: true }
      }));
    },

    setProgress: function(value) {
      ensureInitialized();
      if (terminated) return;

      var progress = Math.max(0, Math.min(1, value));
      log('setProgress: ' + progress);

      // SCORM 2004 has progress_measure; SCORM 1.2 doesn't
      // For SCORM 1.2, we just track it in suspend data
      if (!IS_SCORM_12) {
        // This is activity-level progress; course progress is calculated from completed activities
        // We could track this in suspend data if needed
      }
    },

    setLocation: function(location) {
      ensureInitialized();
      if (terminated) return;

      var state = getCurrentActivityState();
      if (state) {
        state.location = location;
      }

      // Also set SCORM location (used for resume at course level)
      var locationData = JSON.stringify({
        section: courseState.currentSection,
        activity: courseState.currentActivity,
        activityLocation: location
      });

      if (IS_SCORM_12) {
        setValue('cmi.core.lesson_location', locationData.substring(0, 255)); // 255 char limit
      } else {
        setValue('cmi.location', locationData.substring(0, 1000)); // 1000 char limit
      }

      saveSuspendData();
    },

    getLocation: function() {
      ensureInitialized();
      var state = getCurrentActivityState();
      return state ? state.location : null;
    },

    suspend: function(data) {
      ensureInitialized();
      if (terminated) return;

      var state = getCurrentActivityState();
      if (state) {
        state.suspendData = data;
      }

      saveSuspendData();
    },

    restore: function() {
      ensureInitialized();
      var state = getCurrentActivityState();
      return state ? state.suspendData : null;
    },

    record: function(statement) {
      ensureInitialized();
      if (terminated) return;

      // Add timestamp if not present
      if (!statement.timestamp) {
        statement.timestamp = Date.now();
      }

      // Store in activity state
      var state = getCurrentActivityState();
      if (state) {
        state.statements.push(statement);
      }

      // Record as SCORM interaction
      recordInteraction(statement);

      log('record: ' + statement.verb + ' → ' + statement.object.id);
    }
  };

  log('CourseAPI (SCORM ${version}) loaded');
})();
`
}

/**
 * Generates the navigation bridge script for multi-activity courses.
 *
 * This script handles:
 * - Activity switching via window custom events
 * - Dynamic SFC compilation via vue3-sfc-loader
 * - CourseAPI state management per activity
 * - Resume from saved position
 */
export function generateNavigationBridgeScript(): string {
  return `
(function() {
  'use strict';

  var course = window.__PLAYSHAPE_COURSE__;
  if (!course) {
    console.error('[NavBridge] No course data found');
    return;
  }

  var currentSectionIndex = 0;
  var currentActivityIndex = 0;
  var currentApp = null;
  var ActivityComponent = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getTotalActivities() {
    var count = 0;
    for (var i = 0; i < course.sections.length; i++) {
      count += course.sections[i].activities.length;
    }
    return count;
  }

  function getCompletedActivities() {
    var state = window.CourseAPI._getState();
    var count = 0;
    for (var id in state.activityStates) {
      var s = state.activityStates[id];
      if (s.status === 'completed' || s.status === 'passed' || s.status === 'failed') {
        count++;
      }
    }
    return count;
  }

  function getCurrentActivity() {
    var section = course.sections[currentSectionIndex];
    if (!section || !section.activities[currentActivityIndex]) {
      return null;
    }
    return section.activities[currentActivityIndex];
  }

  function getFlatActivityIndex() {
    var index = 0;
    for (var i = 0; i < currentSectionIndex; i++) {
      index += course.sections[i].activities.length;
    }
    return index + currentActivityIndex;
  }

  // ── Activity Loading ────────────────────────────────────────────────────────
  async function loadActivity(sectionIdx, activityIdx) {
    var section = course.sections[sectionIdx];
    if (!section) {
      console.error('[NavBridge] Invalid section index:', sectionIdx);
      return;
    }

    var activity = section.activities[activityIdx];
    if (!activity) {
      console.error('[NavBridge] Invalid activity index:', activityIdx);
      return;
    }

    console.log('[NavBridge] Loading activity:', activity.name);

    // Update current position
    currentSectionIndex = sectionIdx;
    currentActivityIndex = activityIdx;

    // Update CourseAPI to track the new activity
    window.CourseAPI._setCurrentActivity(activity.id);

    // Unmount previous activity
    if (currentApp) {
      try { currentApp.unmount(); } catch (e) {}
      currentApp = null;
    }

    // Get the activity slot element
    var slotEl = document.querySelector('[data-activity-slot]') || document.getElementById('activity-slot');
    if (!slotEl) {
      console.error('[NavBridge] Activity slot element not found');
      return;
    }

    slotEl.innerHTML = '<div class="flex items-center justify-center h-64 text-muted">Loading activity...</div>';

    try {
      // Build dependency mappings for vue3-sfc-loader
      var depMappings = {};
      if (activity.deps) {
        for (var i = 0; i < activity.deps.length; i++) {
          var dep = activity.deps[i];
          if (window[dep.global]) {
            depMappings[dep.name] = window[dep.global];
          }
        }
      }

      var moduleCache = { vue: Vue };
      for (var pkg in depMappings) {
        moduleCache[pkg] = depMappings[pkg];
      }

      var options = {
        moduleCache: moduleCache,
        getFile: function(url) {
          if (url === '/activity.vue') {
            return Promise.resolve(activity.sfc);
          }
          return fetch(url).then(function(r) {
            return r.ok ? r.text() : Promise.reject(new Error(url + ' ' + r.statusText));
          });
        },
        addStyle: function(textContent) {
          var style = document.createElement('style');
          style.textContent = textContent;
          document.head.appendChild(style);
        }
      };

      var loadModule = window['vue3-sfc-loader'].loadModule;
      ActivityComponent = Vue.defineAsyncComponent(function() {
        return loadModule('/activity.vue', options);
      });

      slotEl.innerHTML = '';

      currentApp = Vue.createApp({
        render: function() {
          return Vue.h(ActivityComponent, { data: activity.data || {} });
        }
      });

      currentApp.config.errorHandler = function(err) {
        slotEl.innerHTML = '<div class="text-error p-4">Error loading activity: ' + (err.message || err) + '</div>';
        console.error('[NavBridge] Activity error:', err);
      };

      currentApp.mount(slotEl);

      // Dispatch event for interface template
      window.dispatchEvent(new CustomEvent('playshape:activity-changed', {
        detail: {
          sectionIndex: currentSectionIndex,
          activityIndex: currentActivityIndex,
          activityId: activity.id,
          activityName: activity.name,
          sectionTitle: section.title,
          totalActivities: getTotalActivities(),
          completedActivities: getCompletedActivities(),
          flatIndex: getFlatActivityIndex()
        }
      }));

    } catch (err) {
      console.error('[NavBridge] Failed to load activity:', err);
      slotEl.innerHTML = '<div class="text-error p-4">Failed to load activity: ' + (err.message || err) + '</div>';
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  function navigateNext() {
    var section = course.sections[currentSectionIndex];
    if (currentActivityIndex < section.activities.length - 1) {
      loadActivity(currentSectionIndex, currentActivityIndex + 1);
    } else if (currentSectionIndex < course.sections.length - 1) {
      loadActivity(currentSectionIndex + 1, 0);
    } else {
      console.log('[NavBridge] Already at last activity');
      window.dispatchEvent(new CustomEvent('playshape:course-end'));
    }
  }

  function navigatePrev() {
    if (currentActivityIndex > 0) {
      loadActivity(currentSectionIndex, currentActivityIndex - 1);
    } else if (currentSectionIndex > 0) {
      var prevSection = course.sections[currentSectionIndex - 1];
      loadActivity(currentSectionIndex - 1, prevSection.activities.length - 1);
    } else {
      console.log('[NavBridge] Already at first activity');
    }
  }

  function navigateTo(sectionIdx, activityIdx) {
    if (sectionIdx >= 0 && sectionIdx < course.sections.length) {
      var section = course.sections[sectionIdx];
      if (activityIdx >= 0 && activityIdx < section.activities.length) {
        loadActivity(sectionIdx, activityIdx);
      }
    }
  }

  // ── Event Listeners ─────────────────────────────────────────────────────────
  window.addEventListener('playshape:navigate', function(e) {
    var detail = e.detail || {};
    switch (detail.action) {
      case 'next':
        navigateNext();
        break;
      case 'prev':
        navigatePrev();
        break;
      case 'goto':
        navigateTo(detail.section, detail.activity);
        break;
    }
  });

  // ── Resume Logic ────────────────────────────────────────────────────────────
  function resume() {
    var state = window.CourseAPI._getState();

    // Check if we have saved course position
    if (state.courseState && state.courseState.currentSection !== undefined) {
      currentSectionIndex = state.courseState.currentSection;
      currentActivityIndex = state.courseState.currentActivity;
    }

    // Validate position
    if (currentSectionIndex >= course.sections.length) {
      currentSectionIndex = 0;
      currentActivityIndex = 0;
    } else {
      var section = course.sections[currentSectionIndex];
      if (currentActivityIndex >= section.activities.length) {
        currentActivityIndex = 0;
      }
    }

    // Load the activity
    loadActivity(currentSectionIndex, currentActivityIndex);
  }

  // ── Initialization ──────────────────────────────────────────────────────────
  // Wait for CourseAPI to initialize, then resume
  setTimeout(function() {
    resume();
  }, 100);

  // Expose for debugging
  window.__playshapeNav = {
    next: navigateNext,
    prev: navigatePrev,
    goTo: navigateTo,
    getCurrentPosition: function() {
      return { section: currentSectionIndex, activity: currentActivityIndex };
    },
    getCourse: function() { return course; }
  };

  console.log('[NavBridge] Initialized with', getTotalActivities(), 'activities');
})();
`
}
