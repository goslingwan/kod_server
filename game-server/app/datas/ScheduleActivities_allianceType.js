"use strict"

var allianceType = {}
module.exports = allianceType

allianceType["gacha"] = {
	type:"gacha",
	desc:"游乐场赛季",
	existHours:48,
	expireHours:48,
	maxRank:20,
	scoreIndex1:50,
	scoreIndex2:250,
	scoreIndex3:500,
	scoreIndex4:750,
	scoreIndex5:1000,
	scoreRewards1:"items:sweepScroll:2,items:gemClass_2:2",
	scoreRewards2:"items:gemClass_2:2,items:chest_1:2",
	scoreRewards3:"items:speedup_2:20,items:vipActive_3:2",
	scoreRewards4:"items:speedup_3:10,items:unitHpBonus_1:1",
	scoreRewards5:"items:dragonHp_2:1,items:troopSizeBonus_2:1",
	rankPoint1:1,
	rankPoint2:2,
	rankPoint3:3,
	rankPoint4:4,
	rankPoint5:5,
	rankPoint6:7,
	rankPoint7:10,
	rankPoint8:14,
	rankRewards1:"items:dragonExp_2:3,items:chest_4:1,items:masterOfDefender_2:1,items:infantryAtkBonus_2:1,items:archerAtkBonus_2:1,items:cavalryAtkBonus_2:1,items:siegeAtkBonus_2:1,items:gemClass_3:1",
	rankRewards2:"items:dragonExp_2:2,items:chest_4:1,items:masterOfDefender_2:1,items:marchSpeedBonus_1:2,items:unitHpBonus_1:2,items:quarterMaster_1:2,items:gemClass_3:1",
	rankRewards3:"items:dragonExp_2:1,items:chest_4:1,items:masterOfDefender_2:2,items:marchSpeedBonus_1:2,items:unitHpBonus_1:2,items:gemClass_3:1",
	rankRewards4:"items:dragonExp_1:5,items:chest_4:1,items:masterOfDefender_2:2,items:marchSpeedBonus_1:2,items:gemClass_3:1",
	rankRewards5:"items:dragonExp_1:2,items:chest_4:1,items:marchSpeedBonus_1:2,items:gemClass_2:5",
	rankRewards6:"items:dragonExp_1:2,items:chest_3:1,items:gemClass_2:1",
	rankRewards7:"items:dragonExp_1:1,items:chest_2:1",
	rankRewards8:"items:chest_2:1"
}
allianceType["collectResource"] = {
	type:"collectResource",
	desc:"资源掠夺赛季",
	existHours:48,
	expireHours:48,
	maxRank:20,
	scoreIndex1:100000,
	scoreIndex2:500000,
	scoreIndex3:1500000,
	scoreIndex4:5000000,
	scoreIndex5:50000000,
	scoreRewards1:"items:sweepScroll:4,items:speedup_2:5",
	scoreRewards2:"items:gemClass_2:1,items:casinoTokenClass_1:2",
	scoreRewards3:"items:gemClass_2:2,items:casinoTokenClass_1:3",
	scoreRewards4:"items:gemClass_2:2,items:casinoTokenClass_2:3",
	scoreRewards5:"items:gemClass_2:5,items:casinoTokenClass_2:3",
	rankPoint1:1,
	rankPoint2:2,
	rankPoint3:3,
	rankPoint4:4,
	rankPoint5:5,
	rankPoint6:7,
	rankPoint7:10,
	rankPoint8:14,
	rankRewards1:"items:dragonChest_3:2,items:coinClass_6:1,items:vipPoint_2:1,items:vipActive_3:3,items:unitHpBonus_2:1,items:marchSpeedBonus_2:1,items:speedup_4:5,items:gemClass_3:1",
	rankRewards2:"items:dragonChest_3:1,items:coinClass_6:1,items:vipPoint_1:2,items:speedup_4:5,items:unitHpBonus_1:1,items:marchSpeedBonus_1:1,items:gemClass_3:1",
	rankRewards3:"items:dragonChest_3:1,items:coinClass_5:1,items:vipPoint_1:1,items:speedup_4:1,items:unitHpBonus_1:1,items:gemClass_2:5",
	rankRewards4:"items:dragonChest_2:4,items:coinClass_5:1,items:vipPoint_1:1,items:unitHpBonus_1:1,items:gemClass_2:5",
	rankRewards5:"items:dragonChest_2:2,items:vipActive_3:2,items:unitHpBonus_1:1,items:gemClass_2:2",
	rankRewards6:"items:dragonChest_2:1,items:vipActive_3:2,items:gemClass_2:1",
	rankRewards7:"items:vipActive_3:2,items:gemClass_2:1",
	rankRewards8:"items:gemClass_2:1"
}
allianceType["pveFight"] = {
	type:"pveFight",
	desc:"冒险家赛季",
	existHours:48,
	expireHours:48,
	maxRank:20,
	scoreIndex1:500,
	scoreIndex2:1000,
	scoreIndex3:2000,
	scoreIndex4:8000,
	scoreIndex5:16000,
	scoreRewards1:"items:casinoTokenClass_1:1,items:sweepScroll:1",
	scoreRewards2:"items:gemClass_2:2,items:chest_1:2",
	scoreRewards3:"items:coinClass_5:1,items:speedup_4:1",
	scoreRewards4:"items:vipPoint_1:1,items:unitHpBonus_1:1",
	scoreRewards5:"items:dragonHp_2:1,items:troopSizeBonus_2:1",
	rankPoint1:1,
	rankPoint2:2,
	rankPoint3:3,
	rankPoint4:4,
	rankPoint5:5,
	rankPoint6:7,
	rankPoint7:10,
	rankPoint8:14,
	rankRewards1:"items:heroBlood_2:1,items:troopSizeBonus_2:1,items:casinoTokenClass_2:5,items:stamina_2:2,items:sweepScroll:10,items:warSpeedupClass_2:10,items:restoreWall_2:2,items:gemClass_3:1",
	rankRewards2:"items:heroBlood_1:5,items:troopSizeBonus_2:1,items:casinoTokenClass_2:5,items:stamina_2:2,items:sweepScroll:10,items:warSpeedupClass_2:10,items:gemClass_3:1",
	rankRewards3:"items:heroBlood_1:3,items:troopSizeBonus_2:1,items:casinoTokenClass_2:5,items:stamina_2:2,items:sweepScroll:10,items:gemClass_3:1",
	rankRewards4:"items:heroBlood_1:2,items:troopSizeBonus_1:2,items:casinoTokenClass_2:5,items:sweepScroll:10,items:gemClass_3:1",
	rankRewards5:"items:heroBlood_1:2,items:troopSizeBonus_1:1,items:casinoTokenClass_2:2,items:gemClass_2:5",
	rankRewards6:"items:heroBlood_1:1,items:casinoTokenClass_2:1,items:gemClass_2:5",
	rankRewards7:"items:casinoTokenClass_2:1,items:gemClass_2:2",
	rankRewards8:"items:gemClass_2:1"
}
allianceType["attackMonster"] = {
	type:"attackMonster",
	desc:"黑龙军团赛季",
	existHours:48,
	expireHours:48,
	maxRank:20,
	scoreIndex1:250,
	scoreIndex2:750,
	scoreIndex3:1500,
	scoreIndex4:4500,
	scoreIndex5:9000,
	scoreRewards1:"items:sweepScroll:2,items:gemClass_2:2",
	scoreRewards2:"items:gemClass_2:2,items:vipActive_3:2",
	scoreRewards3:"items:moveTheCity:1,items:vipPoint_1:1",
	scoreRewards4:"items:chest_3:1,items:movingConstruction:5",
	scoreRewards5:"items:coinClass_5:2,items:warSpeedupClass_2:1",
	rankPoint1:1,
	rankPoint2:2,
	rankPoint3:3,
	rankPoint4:4,
	rankPoint5:5,
	rankPoint6:7,
	rankPoint7:10,
	rankPoint8:14,
	rankRewards1:"items:dragonExp_2:3,items:chest_4:1,items:masterOfDefender_2:1,items:infantryAtkBonus_2:1,items:archerAtkBonus_2:1,items:cavalryAtkBonus_2:1,items:siegeAtkBonus_2:1,items:gemClass_3:1",
	rankRewards2:"items:dragonExp_2:2,items:chest_4:1,items:masterOfDefender_2:1,items:marchSpeedBonus_1:2,items:unitHpBonus_1:2,items:quarterMaster_1:2,items:gemClass_3:1",
	rankRewards3:"items:dragonExp_2:1,items:chest_4:1,items:masterOfDefender_2:2,items:marchSpeedBonus_1:2,items:unitHpBonus_1:2,items:gemClass_3:1",
	rankRewards4:"items:dragonExp_1:5,items:chest_4:1,items:masterOfDefender_2:2,items:marchSpeedBonus_1:2,items:gemClass_3:1",
	rankRewards5:"items:dragonExp_1:2,items:chest_4:1,items:marchSpeedBonus_1:2,items:gemClass_2:5",
	rankRewards6:"items:dragonExp_1:2,items:chest_3:1,items:gemClass_2:1",
	rankRewards7:"items:dragonExp_1:1,items:chest_2:1",
	rankRewards8:"items:chest_2:1"
}
allianceType["collectHeroBlood"] = {
	type:"collectHeroBlood",
	desc:"杀戮之王赛季",
	existHours:48,
	expireHours:48,
	maxRank:20,
	scoreIndex1:10000,
	scoreIndex2:30000,
	scoreIndex3:90000,
	scoreIndex4:300000,
	scoreIndex5:1000000,
	scoreRewards1:"items:sweepScroll:4,items:speedup_2:5",
	scoreRewards2:"items:gemClass_2:2,items:chest_1:2",
	scoreRewards3:"items:coinClass_4:2,items:sweepScroll:6",
	scoreRewards4:"items:coinClass_5:1,items:dragonHp_1:10",
	scoreRewards5:"items:coinClass_5:1,items:marchSpeedBonus_1:2",
	rankPoint1:1,
	rankPoint2:2,
	rankPoint3:3,
	rankPoint4:4,
	rankPoint5:5,
	rankPoint6:7,
	rankPoint7:10,
	rankPoint8:14,
	rankRewards1:"items:dragonChest_3:2,items:coinClass_6:1,items:vipPoint_2:1,items:vipActive_3:3,items:unitHpBonus_2:1,items:marchSpeedBonus_2:1,items:speedup_4:5,items:gemClass_3:1",
	rankRewards2:"items:dragonChest_3:2,items:coinClass_6:1,items:vipPoint_1:2,items:speedup_4:5,items:unitHpBonus_1:1,items:marchSpeedBonus_1:1,items:gemClass_3:1",
	rankRewards3:"items:dragonChest_3:1,items:coinClass_5:1,items:vipPoint_1:1,items:speedup_4:1,items:unitHpBonus_1:1,items:gemClass_2:5",
	rankRewards4:"items:dragonChest_2:4,items:coinClass_5:1,items:vipPoint_1:1,items:unitHpBonus_1:1,items:gemClass_2:5",
	rankRewards5:"items:dragonChest_2:2,items:vipActive_3:2,items:unitHpBonus_1:1,items:gemClass_2:2",
	rankRewards6:"items:dragonChest_2:1,items:vipActive_3:2,items:gemClass_2:1",
	rankRewards7:"items:vipActive_3:2,items:gemClass_2:1",
	rankRewards8:"items:gemClass_2:1"
}
allianceType["recruitSoldiers"] = {
	type:"recruitSoldiers",
	desc:"军备竞赛赛季",
	existHours:48,
	expireHours:48,
	maxRank:20,
	scoreIndex1:5000,
	scoreIndex2:25000,
	scoreIndex3:100000,
	scoreIndex4:500000,
	scoreIndex5:1000000,
	scoreRewards1:"items:casinoTokenClass_1:1,items:speedup_2:5",
	scoreRewards2:"items:gemClass_2:2,items:chest_1:2",
	scoreRewards3:"items:casinoTokenClass_1:4,items:sweepScroll:5",
	scoreRewards4:"items:chest_1:3,items:chest_3:1",
	scoreRewards5:"items:chest_2:2,items:speedup_3:20",
	rankPoint1:1,
	rankPoint2:2,
	rankPoint3:3,
	rankPoint4:4,
	rankPoint5:5,
	rankPoint6:7,
	rankPoint7:10,
	rankPoint8:14,
	rankRewards1:"items:heroBlood_2:1,items:troopSizeBonus_2:1,items:casinoTokenClass_2:5,items:stamina_2:2,items:sweepScroll:10,items:warSpeedupClass_2:10,items:restoreWall_2:2,items:gemClass_3:1",
	rankRewards2:"items:heroBlood_1:5,items:troopSizeBonus_2:1,items:casinoTokenClass_2:5,items:stamina_2:2,items:sweepScroll:10,items:warSpeedupClass_2:10,items:gemClass_3:1",
	rankRewards3:"items:heroBlood_1:3,items:troopSizeBonus_2:1,items:casinoTokenClass_2:5,items:stamina_2:2,items:sweepScroll:10,items:gemClass_3:1",
	rankRewards4:"items:heroBlood_1:2,items:troopSizeBonus_1:2,items:casinoTokenClass_2:5,items:sweepScroll:10,items:gemClass_3:1",
	rankRewards5:"items:heroBlood_1:2,items:troopSizeBonus_1:1,items:casinoTokenClass_2:2,items:gemClass_2:5",
	rankRewards6:"items:heroBlood_1:1,items:casinoTokenClass_2:1,items:gemClass_2:5",
	rankRewards7:"items:casinoTokenClass_2:1,items:gemClass_2:2",
	rankRewards8:"items:gemClass_2:1"
}
