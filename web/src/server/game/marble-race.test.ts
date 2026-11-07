import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RACE_CAP_MS, TRACK_SCALE, decodeTrack, liveOrder, marbleAt } from '../../features/game/marble-race'
import { generateCourse, raceFor, simulateRace } from './minigames/marble-race'

test('the same seed rebuilds the same course and the same race, frame by frame', () => {
  const course = generateCourse(42, 6)
  assert.deepEqual(generateCourse(42, 6), course)
  assert.notDeepEqual(generateCourse(43, 6), course)
  const run = simulateRace(course, 42)
  assert.deepEqual(simulateRace(generateCourse(42, 6), 42), run)
  assert.deepEqual(raceFor(42, 6), run)
})

test('every marble stays on the course and arrives before the cap, computed in well under a second', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const course = generateCourse(seed * 7_919, 10)
    const started = performance.now()
    const run = simulateRace(course, seed * 7_919)
    assert.ok(performance.now() - started < 1_000, `seed ${seed} took too long`)
    assert.ok(run.finishMs.every(time => time !== null), `seed ${seed} left a marble behind`)
    assert.ok(run.durationMs <= RACE_CAP_MS)
    const track = decodeTrack(run.track)
    for (let index = 0; index < track.length; index += 2) {
      assert.ok(track[index] >= 0 && track[index] <= course.width * TRACK_SCALE, `seed ${seed} lost a marble sideways`)
      assert.ok(track[index + 1] >= 0 && track[index + 1] <= course.height * TRACK_SCALE, `seed ${seed} lost a marble vertically`)
    }
    assert.deepEqual([...run.order].sort((left, right) => left - right), [...Array(10).keys()])
  }
})

test('no start position wins more than one race in three', () => {
  const wins = Array(6).fill(0)
  for (let seed = 1; seed <= 60; seed++) wins[simulateRace(generateCourse(seed * 104_729, 6), seed * 104_729).order[0]]++
  assert.ok(Math.max(...wins) <= 20, `wins by start position: ${wins.join(', ')}`)
})

test('the phones decode the start, the arrival and the same final order', () => {
  const course = generateCourse(7, 4)
  const run = raceFor(7, 4)
  const track = decodeTrack(run.track)
  assert.equal(track.length % 8, 0)
  for (let slot = 0; slot < 4; slot++) {
    const [x, y] = marbleAt(track, 4, slot, 0)
    assert.ok(Math.abs(x - course.starts[slot * 2]) < .01 && Math.abs(y - course.starts[slot * 2 + 1]) < .01)
    assert.ok(marbleAt(track, 4, slot, run.finishMs[slot]! + 100)[1] >= course.finishY - .5, 'arrived marbles are past the line')
  }
  assert.deepEqual(liveOrder(track, run.finishMs, run.durationMs), run.order)
  assert.deepEqual(liveOrder(track, run.finishMs, run.durationMs + 5_000), run.order, 'the order holds after the end')
})
