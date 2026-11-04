/** What a character's stored scores show, for the medals read from them. */
export type ScoreFacts = {
	pass: number,
	fc: number,
	topPlay: number,
	rice: boolean,
	ln: boolean,
	combo727: boolean,
	possessed: boolean,
	parallax: boolean,
	wonderful: boolean,
	grades: string[],
};

/** What older scores showed, with what newer ones show. */
export const mergeFacts = (old: ScoreFacts, now: ScoreFacts): ScoreFacts => ({
	pass: Math.max(old.pass, now.pass),
	fc: Math.max(old.fc, now.fc),
	topPlay: Math.max(old.topPlay, now.topPlay),
	rice: old.rice || now.rice,
	ln: old.ln || now.ln,
	combo727: old.combo727 || now.combo727,
	possessed: old.possessed || now.possessed,
	parallax: old.parallax || now.parallax,
	wonderful: old.wonderful || now.wonderful,
	grades: [...new Set([...old.grades, ...now.grades])],
});
