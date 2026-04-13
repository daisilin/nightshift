import { describe, it, expect } from 'vitest';
import { generatePool, poolStats } from '../participantPool';

describe('ParticipantPool', () => {
  describe('generatePool', () => {
    it('generates N participants', () => {
      const pool = generatePool('college-student', 50);
      expect(pool).toHaveLength(50);
    });

    it('each participant has all required fields', () => {
      const pool = generatePool('college-student', 10);
      for (const p of pool) {
        expect(p.id).toBeTruthy();
        expect(p.demographics.age).toBeGreaterThan(0);
        expect(p.demographics.gender).toBeTruthy();
        expect(p.demographics.education).toBeTruthy();
        expect(p.demographics.occupation).toBeTruthy();
        expect(p.demographics.location).toBeTruthy();
        expect(p.backstory).toBeTruthy();
        expect(p.behavioral).toBeTruthy();
        expect(p.behavioral.rtMultiplier).toBeGreaterThan(0);
        expect(p.latentProfile).toBeTruthy();
        expect(p.llmPrompt).toBeTruthy();
        expect(p.llmPrompt.length).toBeGreaterThan(50);
      }
    });

    it('college students are ages 18-24', () => {
      const pool = generatePool('college-student', 100);
      for (const p of pool) {
        expect(p.demographics.age).toBeGreaterThanOrEqual(15); // ±3 from 18
        expect(p.demographics.age).toBeLessThanOrEqual(27);    // ±3 from 24
      }
    });

    it('older adults are ages 62+', () => {
      const pool = generatePool('older-adult', 100);
      for (const p of pool) {
        expect(p.demographics.age).toBeGreaterThanOrEqual(62);
      }
    });

    it('children are ages 4-15', () => {
      const pool = generatePool('child', 100);
      for (const p of pool) {
        expect(p.demographics.age).toBeGreaterThanOrEqual(4);
        expect(p.demographics.age).toBeLessThanOrEqual(15);
      }
    });

    it('participants are diverse (not all identical)', () => {
      const pool = generatePool('college-student', 20);
      const ages = new Set(pool.map(p => p.demographics.age));
      const genders = new Set(pool.map(p => p.demographics.gender));
      const backstories = new Set(pool.map(p => p.backstory));

      expect(ages.size).toBeGreaterThan(3);        // diverse ages
      expect(genders.size).toBeGreaterThan(1);      // mixed gender
      expect(backstories.size).toBeGreaterThan(3);  // diverse backstories
    });

    it('behavioral params vary across participants', () => {
      const pool = generatePool('mturk-worker', 50);
      const rtMults = new Set(pool.map(p => p.behavioral.rtMultiplier));
      const lapseRates = new Set(pool.map(p => p.behavioral.attentionLapseRate));

      expect(rtMults.size).toBeGreaterThan(10);     // not all same multiplier
      expect(lapseRates.size).toBeGreaterThan(10);
    });

    it('older adults are slower than college students on average', () => {
      const young = generatePool('college-student', 100);
      const old = generatePool('older-adult', 100);
      const youngAvg = young.reduce((s, p) => s + p.behavioral.rtMultiplier, 0) / 100;
      const oldAvg = old.reduce((s, p) => s + p.behavioral.rtMultiplier, 0) / 100;

      expect(oldAvg).toBeGreaterThan(youngAvg);
    });

    it('children have higher lapse rates than adults', () => {
      const adults = generatePool('college-student', 100);
      const children = generatePool('child', 100);
      const adultLapse = adults.reduce((s, p) => s + p.behavioral.attentionLapseRate, 0) / 100;
      const childLapse = children.reduce((s, p) => s + p.behavioral.attentionLapseRate, 0) / 100;

      expect(childLapse).toBeGreaterThan(adultLapse);
    });

    it('LLM prompts mention the persona demographics', () => {
      const pool = generatePool('older-adult', 5);
      for (const p of pool) {
        expect(p.llmPrompt).toContain(String(p.demographics.age));
        expect(p.llmPrompt.toLowerCase()).toContain('technology');
      }
    });

    it('deterministic with same seed', () => {
      const a = generatePool('college-student', 10, 42);
      const b = generatePool('college-student', 10, 42);
      expect(a[0].demographics.age).toBe(b[0].demographics.age);
      expect(a[0].behavioral.rtMultiplier).toBe(b[0].behavioral.rtMultiplier);
    });

    it('different seeds produce different pools', () => {
      const a = generatePool('college-student', 10, 42);
      const b = generatePool('college-student', 10, 99);
      const sameAge = a.filter((p, i) => p.demographics.age === b[i].demographics.age).length;
      expect(sameAge).toBeLessThan(8); // most should differ
    });
  });

  describe('poolStats', () => {
    it('returns correct summary', () => {
      const pool = generatePool('college-student', 50);
      const stats = poolStats(pool);
      expect(stats.n).toBe(50);
      expect(stats.ageRange[0]).toBeGreaterThanOrEqual(15);
      expect(stats.ageRange[1]).toBeLessThanOrEqual(27);
      expect(stats.meanRtMult).toBeGreaterThan(0.8);
      expect(stats.meanRtMult).toBeLessThan(1.2);
    });
  });
});
