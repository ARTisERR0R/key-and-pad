import { updatedWithinPath } from './misc-helpers';
import WebAudioManager from './web-audio-manager';

let currentState,
    store,
    unsubscribe;

export function initializeWebAudio(reduxStore) {
  store = reduxStore;
  unsubscribe = store.subscribe(reconcile);
}

// Currently unused
export function destroy() {
  unsubscribe();
}

export function reconcile() {
  const previousState = currentState;
  currentState = store.getState();

  // If this is our very first reconciliation, we don't have anything to compare!
  if (typeof previousState === 'undefined') { return; }

  // There are three main areas of 'change':
  //
  // - A change to the notes being played,
  // - A change to the oscillators' setting (eg. waveform),
  // - A change to the pad effects, either moving the mouse across the pad,
  //   changing one of the effects, or tweaking one of the effect parameters.
  //
  // The changes should be independent; no single event should change both.
  // That said, let's leave it open to the option, since we may want to
  // throttle the subscribe callback.

  // bind our two states to our convenience helper function, so that we can
  // pass it a path and know if that path has changed in this state change.
  const updatedInNewState = updatedWithinPath(previousState, currentState);

  const notesUpdated = updatedInNewState('notes');
  const oscillatorsUpdated = updatedInNewState('oscillators');
  const effectsUpdated = updatedInNewState('effects');

  // It's possible that this update isn't relevant for Web Audio.
  const soundsUpdated = notesUpdated || oscillatorsUpdated || effectsUpdated;
  if (!soundsUpdated) { return; }

  // If either the notes or the oscillators' settings changed,
  // simply destroy all oscillators and rebuild.
  if (notesUpdated || oscillatorsUpdated) {
    WebAudioManager.stopAllOscillators();
    WebAudioManager.createOscillators(currentState)
  }

  if (effectsUpdated) {
    // This is a bit tougher...
    ['x', 'y'].forEach(axis => {
      // Skip this axis if it wasn't the one updated
      if (!updatedInNewState(['effects', axis])) { return; }

      // We know the axis has changed, but there are 3 possible axis changes:
      const positionChanged = updatedInNewState(['effects', axis, 'amount']);
      const effectNameChanged = updatedInNewState(['effects', axis, 'name']);
      const effectParamTweaked = updatedInNewState(['effects', axis, 'options']);

      // If the position has changed, we just need to tweak the amount
      if (positionChanged) {
        WebAudioManager.updateEffectAmount({ axis, amount: currentState});
      }

      // If the effect itself was swapped out, we need to destroy the effect
      // chain and recreate it
      if (effectNameChanged) {
        WebAudioManager.destroyEffectChain();
        WebAudioManager.rebuildEffectChain({ ...currentState.effects });
      }

      // If the effect's parameters were tweaked, update it
      if (effectParamTweaked) {
        WebAudioManager.updateEffectParameters({ axis, options: currentState.effects[axis].options });
      }
    })
  }
}

//
// STATE EXAMPLE
//
// {
//   keys: ['c4', 'e4', 'g4'],
//   oscillators: [
//     {
//       waveform: 'sawtooth',
//       gain: 0.15,
//       octaveAdjustment: 0,
//     }, {
//       waveform: 'square',
//       gain: 0.5,
//       octaveAdjustment: -1,
//     }
//   ],
//   effects: {
//     x: {
//       name: 'filter',
//       amount: 0.4,
//       options: {
//         type: 'lowpass',
//         resonance: '5'
//       }
//     }
//   },
//   y: {
//     name: 'distortion',
//     amount: 0.75,
//     options: {
//       oversampling: '4x'
//     }
//   }
// }
