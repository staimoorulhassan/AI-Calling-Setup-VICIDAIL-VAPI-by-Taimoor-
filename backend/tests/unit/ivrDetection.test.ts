import { classifyIvr } from '../../src/services/ivrDetection';

describe('classifyIvr', () => {
  it('returns isIvr=false for normal human speech', () => {
    expect(classifyIvr('Hello, who is this?').isIvr).toBe(false);
    expect(classifyIvr('Yes I am interested').isIvr).toBe(false);
    expect(classifyIvr('Can you call back later?').isIvr).toBe(false);
  });

  it('detects "press 1" IVR phrase (TC-4)', () => {
    const result = classifyIvr('For English press 1, for Spanish press 2');
    expect(result.isIvr).toBe(true);
    expect(result.matchedPhrase).toBeTruthy();
  });

  it('detects "please hold" IVR phrase', () => {
    expect(classifyIvr('Thank you, please hold while we connect you').isIvr).toBe(true);
  });

  it('detects "your call is important" (TC-5)', () => {
    expect(classifyIvr('Your call is important to us. Please stay on the line.').isIvr).toBe(true);
  });

  it('detects "para español" IVR phrase', () => {
    expect(classifyIvr('Para español marque dos').isIvr).toBe(true);
  });

  it('detects "leave a message" voicemail IVR', () => {
    expect(classifyIvr('Please leave a message after the tone').isIvr).toBe(true);
  });

  it('detects "no one is available" IVR', () => {
    expect(classifyIvr('No one is available to take your call right now').isIvr).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(classifyIvr('PRESS 1 FOR SALES').isIvr).toBe(true);
    expect(classifyIvr('Please Hold').isIvr).toBe(true);
  });

  it('returns matchedPhrase=null for non-IVR', () => {
    expect(classifyIvr('Hi there').matchedPhrase).toBeNull();
  });
});
