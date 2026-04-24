import assert from 'node:assert/strict';
import test from 'node:test';

import { LessonService } from './LessonService.ts';
import { LessonServiceError } from './LessonServiceError.ts';
import { parseLessonFlowDraft } from './lessonFlowDraft.ts';

test('parseLessonFlowDraft keeps incomplete choice targets editable in flow drafts', () => {
	const initialDefinition = LessonService.createDefaultDefinition();
	const created = LessonService.createBlock(initialDefinition, 'choice');
	const draftDefinition = structuredClone(created.definition);
	const draftChoice = draftDefinition.blocks.find((block) => block.id === created.block.id);

	assert.equal(draftChoice?.kind, 'choice');
	if (!draftChoice || draftChoice.kind !== 'choice') {
		throw new Error('Expected created block to be a choice block.');
	}

	draftChoice.options[0]!.targetBlockId = '';

	assert.throws(
		() => LessonService.parseDefinition(JSON.stringify(draftDefinition)),
		(error: unknown) =>
			error instanceof LessonServiceError &&
			error.message.includes('Too small: expected string to have >=1 characters')
	);

	const parsedDraft = parseLessonFlowDraft(JSON.stringify(draftDefinition));
	const nextDefinition = LessonService.deleteBlockDraft(parsedDraft, created.block.id);

	assert.equal(
		nextDefinition.blocks.some((block) => block.id === created.block.id),
		false
	);
});

test('parseLessonFlowDraft keeps YouTube blocks editable and normalizes URL input', () => {
	const initialDefinition = LessonService.createDefaultDefinition();
	const created = LessonService.createBlockDraft(initialDefinition, 'youtube');
	const draftDefinition = structuredClone(created.definition);
	const draftYoutube = draftDefinition.blocks.find((block) => block.id === created.block.id);

	assert.equal(draftYoutube?.kind, 'youtube');
	if (!draftYoutube || draftYoutube.kind !== 'youtube') {
		throw new Error('Expected created block to be a YouTube block.');
	}

	draftYoutube.videoId = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
	draftYoutube.next = null;
	draftYoutube.pausePoints = [{ id: ' pause_1 ', seconds: 12, title: 'Alto' }];

	assert.throws(
		() => LessonService.parseDefinition(JSON.stringify(draftDefinition)),
		(error: unknown) =>
			error instanceof LessonServiceError && error.message.includes('necesita un siguiente bloque')
	);

	const parsedDraft = parseLessonFlowDraft(JSON.stringify(draftDefinition));
	const parsedYoutube = parsedDraft.blocks.find((block) => block.id === draftYoutube.id);

	assert.equal(parsedYoutube?.kind, 'youtube');
	assert.equal(
		parsedYoutube?.kind === 'youtube' ? parsedYoutube.videoId : undefined,
		'M7lc1UVf-VE'
	);
	assert.equal(parsedYoutube?.kind === 'youtube' ? parsedYoutube.next : undefined, null);
	assert.equal(
		parsedYoutube?.kind === 'youtube' ? parsedYoutube.pausePoints?.[0]?.id : undefined,
		'pause_1'
	);
});
