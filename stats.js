// all users from database
const allRaw = getAllUsers();

const all = allRaw.sort((a, b) => a.created - b.created);
// get all active users - synced and not sync errored
// const active = all.filter((item) => !!item.last_synced && !item.sync_errored);
// get all synced but sync errored users
// const syncErrored = all.filter((item) => !!item.last_synced && item.sync_errored);
// generate an array of weeks since 01.11.2023
const weeks = [];
const start = 1701820800; // 06.12.2023
const today = (Date.now() + 4 * 24 * 3600 * 1000) / 1000;
for (let i = 0; i < 100; i++) {
	const next = start + i * 604800;
	if (next > today) {
		break;
	}
	weeks.push(next);
}

const stats = weeks.map((week) => {
	const count = all.filter((item) => item.created < week).length;
	const activeCount = all.filter(
		(item) => item.created < week && !!item.last_synced && !item.sync_errors
	).length;
	const weekDateFormattedWithoutYear = new Date(week * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
	});
	return {
		weekDateFormattedWithoutYear,
		count,
		activeCount,
	};
});

console.log(stats.map((item) => item.weekDateFormattedWithoutYear).join(', '));
console.log('all:', stats.map((item) => item.count).join(', '));
console.log('active:', stats.map((item) => item.activeCount).join(', '));

// Get all users from database
// pr db:prod --command="SELECT created, last_synced, json_extract(sync_error, '$.num') as sync_errors FROM users" > output.json
function getAllUsers() {
	return [
		{
			created: 1701996276,
			last_synced: 1702043680,
			sync_errors: 11,
		},
		{
			created: 1703420215,
			last_synced: 1707672756,
			sync_errors: null,
		},
		{
			created: 1703556952,
			last_synced: 1705018785,
			sync_errors: 11,
		},
		{
			created: 1703791741,
			last_synced: 1707672817,
			sync_errors: null,
		},
		{
			created: 1703819452,
			last_synced: 1703819829,
			sync_errors: 11,
		},
		{
			created: 1703823018,
			last_synced: 1707672877,
			sync_errors: null,
		},
		{
			created: 1703891576,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1704134234,
			last_synced: 1704218389,
			sync_errors: 11,
		},
		{
			created: 1704217362,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1704412374,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1704454832,
			last_synced: 1707672639,
			sync_errors: null,
		},
		{
			created: 1704727387,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1704821864,
			last_synced: 1704830531,
			sync_errors: 11,
		},
		{
			created: 1705048985,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1705112223,
			last_synced: 1706289964,
			sync_errors: 11,
		},
		{
			created: 1705116271,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1705161735,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1705277455,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1705492006,
			last_synced: 1707672640,
			sync_errors: null,
		},
		{
			created: 1705510103,
			last_synced: 1707672642,
			sync_errors: null,
		},
		{
			created: 1705600965,
			last_synced: 1705611576,
			sync_errors: 11,
		},
		{
			created: 1705697680,
			last_synced: 1707672642,
			sync_errors: null,
		},
		{
			created: 1705733672,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1705766590,
			last_synced: 1707672758,
			sync_errors: null,
		},
		{
			created: 1705827060,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1705899851,
			last_synced: 1707672879,
			sync_errors: null,
		},
		{
			created: 1705949663,
			last_synced: 1705951668,
			sync_errors: 11,
		},
		{
			created: 1706015836,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706021153,
			last_synced: 1706705326,
			sync_errors: 11,
		},
		{
			created: 1706100165,
			last_synced: 1706156867,
			sync_errors: 11,
		},
		{
			created: 1706116124,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706177710,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706189386,
			last_synced: 1707672822,
			sync_errors: null,
		},
		{
			created: 1706211871,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706220263,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706222817,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706226315,
			last_synced: 1707672758,
			sync_errors: null,
		},
		{
			created: 1706236714,
			last_synced: 1706237461,
			sync_errors: 11,
		},
		{
			created: 1706245199,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706264080,
			last_synced: 1706311151,
			sync_errors: 11,
		},
		{
			created: 1706291516,
			last_synced: 1707672819,
			sync_errors: null,
		},
		{
			created: 1706300712,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706324096,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706389768,
			last_synced: 1707672880,
			sync_errors: null,
		},
		{
			created: 1706432907,
			last_synced: 1706433096,
			sync_errors: 11,
		},
		{
			created: 1706455852,
			last_synced: 1707672576,
			sync_errors: null,
		},
		{
			created: 1706474592,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706485748,
			last_synced: 1707672577,
			sync_errors: null,
		},
		{
			created: 1706486485,
			last_synced: 1707672761,
			sync_errors: null,
		},
		{
			created: 1706490369,
			last_synced: 1707672759,
			sync_errors: null,
		},
		{
			created: 1706502133,
			last_synced: 1707672578,
			sync_errors: null,
		},
		{
			created: 1706513515,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706536455,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706610951,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706624438,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706724187,
			last_synced: 1707672821,
			sync_errors: null,
		},
		{
			created: 1706892995,
			last_synced: 1707672579,
			sync_errors: null,
		},
		{
			created: 1706903981,
			last_synced: 1706904484,
			sync_errors: 11,
		},
		{
			created: 1706956986,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706971523,
			last_synced: 1707672579,
			sync_errors: null,
		},
		{
			created: 1706974778,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1706989020,
			last_synced: 1707672821,
			sync_errors: null,
		},
		{
			created: 1707003661,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707036549,
			last_synced: 1707672579,
			sync_errors: null,
		},
		{
			created: 1707130049,
			last_synced: 1707139696,
			sync_errors: 5,
		},
		{
			created: 1707169873,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707175252,
			last_synced: 1707672580,
			sync_errors: null,
		},
		{
			created: 1707246203,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707248839,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707311542,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707312033,
			last_synced: 1707672643,
			sync_errors: null,
		},
		{
			created: 1707314138,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707319552,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707323083,
			last_synced: 1707672823,
			sync_errors: null,
		},
		{
			created: 1707352101,
			last_synced: 1707672822,
			sync_errors: null,
		},
		{
			created: 1707360002,
			last_synced: 1707672643,
			sync_errors: null,
		},
		{
			created: 1707361159,
			last_synced: 1707672823,
			sync_errors: null,
		},
		{
			created: 1707365586,
			last_synced: 1707672644,
			sync_errors: null,
		},
		{
			created: 1707368309,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707373163,
			last_synced: 1707672823,
			sync_errors: null,
		},
		{
			created: 1707374972,
			last_synced: 1707442486,
			sync_errors: 6,
		},
		{
			created: 1707380252,
			last_synced: 1707672824,
			sync_errors: null,
		},
		{
			created: 1707383149,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707384931,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707387227,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707390743,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707391481,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707393766,
			last_synced: 1707672824,
			sync_errors: null,
		},
		{
			created: 1707394384,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707396471,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707396901,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707398624,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707399361,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707407918,
			last_synced: 1707672824,
			sync_errors: null,
		},
		{
			created: 1707431000,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707441011,
			last_synced: 1707672644,
			sync_errors: null,
		},
		{
			created: 1707447689,
			last_synced: 1707672824,
			sync_errors: null,
		},
		{
			created: 1707454705,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707468008,
			last_synced: 1707672825,
			sync_errors: null,
		},
		{
			created: 1707474092,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707477545,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707481493,
			last_synced: 1707663465,
			sync_errors: 3,
		},
		{
			created: 1707487627,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707488371,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707535729,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707537218,
			last_synced: 1707672580,
			sync_errors: null,
		},
		{
			created: 1707544985,
			last_synced: 1707588019,
			sync_errors: 5,
		},
		{
			created: 1707554454,
			last_synced: 1707672644,
			sync_errors: null,
		},
		{
			created: 1707555538,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707556068,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707559250,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707559916,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707561004,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707561731,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707565678,
			last_synced: 1707672645,
			sync_errors: null,
		},
		{
			created: 1707566611,
			last_synced: 1707672880,
			sync_errors: null,
		},
		{
			created: 1707571638,
			last_synced: 1707672646,
			sync_errors: null,
		},
		{
			created: 1707572935,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707574105,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707577721,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707607759,
			last_synced: 1707672760,
			sync_errors: null,
		},
		{
			created: 1707636254,
			last_synced: 1707672646,
			sync_errors: null,
		},
		{
			created: 1707640914,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707641350,
			last_synced: 1707672762,
			sync_errors: null,
		},
		{
			created: 1707652569,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707656108,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707667082,
			last_synced: null,
			sync_errors: null,
		},
		{
			created: 1707671120,
			last_synced: null,
			sync_errors: null,
		},
	];
}

function getActiveUsers() {}
