import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisAsText, analysisFilename, normalizeAnalysis } from '../src/client/analysis-report.mjs';

test('analysis reports normalize structured and legacy provider output', () => {
  const legacy = normalizeAnalysis('Legacy report text');
  assert.equal(legacy.summary, 'Legacy report text');
  assert.deepEqual(legacy.suggestedContentAreas, []);

  const structured = normalizeAnalysis({
    summary: 'Overall',
    strengths: ['Strong claim', ''],
    improvementAreas: ['Add evidence'],
    suggestedContentAreas: [{ area: 'Stakeholders', whyItMatters: 'Adds breadth', researchDirection: 'Research local groups' }, null],
    studentFeedback: [{ student: 'Jan', evidence: 'Clear point', nextStep: 'Cite evidence' }],
    followUpQuestions: ['Why?'], evidenceLimitations: ['One short turn']
  });
  assert.deepEqual(structured.strengths, ['Strong claim']);
  assert.equal(structured.suggestedContentAreas[0].area, 'Stakeholders');
  assert.equal(structured.studentFeedback[0].student, 'Jan');
});

test('analysis reports export one readable local text file', () => {
  const record = {
    title: 'Analysis 1', promptName: '2025 GRQ Prompt_Final', createdAt: '2026-08-28T01:00:00.000Z',
    questions: [{ question: 'How effective is the solution?', analysis: {
      summary: 'Promising but incomplete.', strengths: ['Clear goal'], improvementAreas: ['Quantify impact'],
      suggestedContentAreas: [{ area: 'Implementation cost', whyItMatters: 'Tests feasibility', researchDirection: 'Compare published local costs' }],
      studentFeedback: [{ student: 'Jan', evidence: 'Identified the target group', nextStep: 'Add a cited example' }],
      followUpQuestions: ['What is the baseline?'], evidenceLimitations: ['No sources were named']
    } }]
  };
  const output = analysisAsText(record, 'Test session');
  assert.match(output, /SUGGESTED CONTENT TO STRENGTHEN THE RESPONSE/);
  assert.match(output, /Implementation cost/);
  assert.match(output, /Jan: Identified the target group/);
  assert.equal(analysisFilename(record), 'pw-grq-2026-08-28-Analysis-1.txt');
});
