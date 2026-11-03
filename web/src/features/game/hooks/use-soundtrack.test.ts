import assert from 'node:assert/strict'
import test from 'node:test'
import { soundModeFor, tickIntervalMs } from './use-soundtrack'

test('ogni fase ha la sua modalità audio', () => {
  assert.equal(soundModeFor('intro'), 'full')
  assert.equal(soundModeFor('scoreboard'), 'full')
  assert.equal(soundModeFor('category_vote'), 'low')
  assert.equal(soundModeFor('minigame_playing', 'bomb'), 'low')
  assert.equal(soundModeFor('question'), 'tick')
  assert.equal(soundModeFor('flash_question'), 'tick')
  assert.equal(soundModeFor('bonus_playing'), 'tick')
  assert.equal(soundModeFor('suspended'), 'silent')
})

test('«Stoppa il timer» resta muto per non aiutare a contare', () => {
  assert.equal(soundModeFor('minigame_playing', 'timer'), 'silent')
  assert.equal(soundModeFor('minigame_intro', 'timer'), 'full')
})

test('il ticchettio accelera negli ultimi secondi', () => {
  assert.equal(tickIntervalMs(12_000), 1_000)
  assert.equal(tickIntervalMs(5_000), 500)
  assert.equal(tickIntervalMs(2_000), 250)
})
