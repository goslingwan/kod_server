"use strict"

/**
 * Created by modun on 14-8-7.
 */

module.exports = {
	GlobalChatChannel:"globalChatChannel",
	AllianceChannelPrefix:"allianceChannel",
	PushServiceName:"pushService",
	AlliancePowerRank:"alliancePowerRank",
	AllianceKillRank:"allianceKillRank",
	ServerStatus:{
		Starting:"starting",
		Stoping:"stoping",
		On:"on",
		ReadyShutdown:"readyShutdown"
	},
	None:"__NONE__",
	ServerState:{
		Start:"start",
		Stop:"stop"
	},
	PlayerStatus:{
		Normal:"normal",
		Rout:"rout"
	},
	DragonStatus:{
		Free:"free",
		March:"march",
		Defence:"defence"
	},
	DragonEquipmentCategory:["crown", "armguardLeft", "armguardRight", "chest", "sting", "orb"],
	BasicResource:["wood", "stone", "iron", "food"],
	MaterialType:{
		BuildingMaterials:"buildingMaterials",
		TechnologyMaterials:"technologyMaterials"
	},
	ResourcesCanDeal:{
		resources:["wood", "stone", "iron", "food"],
		buildingMaterials:["blueprints", "tools", "tiles", "pulley"],
		technologyMaterials:["trainingFigure", "bowTarget", "saddle", "ironPart"]
	},
	TimeEventType:{
		Player:"player",
		Alliance:"alliance",
		AllianceFight:"allianceFight"
	},
	DataChangedType:{
		Add:"add",
		Edit:"edit",
		Remove:"remove"
	},
	FreeSpeedUpAbleEventTypes:{
		BuildingEvents:"buildingEvents",
		HouseEvents:"houseEvents",
		ProductionTechEvents:"productionTechEvents",
		MilitaryTechEvents:"militaryTechEvents",
		SoldierStarEvents:"soldierStarEvents"
	},
	SpeedUpEventTypes:[
		"materialEvents",
		"soldierEvents",
		"soldierStarEvents",
		"treatSoldierEvents",
		"dragonEquipmentEvents",
		"dragonHatchEvents",
		"dragonDeathEvents",
		"buildingEvents",
		"houseEvents",
		"productionTechEvents",
		"militaryTechEvents"
	],
	BuildingSpeedupEventTypes:[
		"buildingEvents",
		"houseEvents"
	],
	WarSpeedupEventTypes:{
		AttackMarchEvents:"attackMarchEvents",
		AttackMarchReturnEvents:"attackMarchReturnEvents",
		StrikeMarchEvents:"strikeMarchEvents",
		StrikeMarchReturnEvents:"strikeMarchReturnEvents"
	},
	FightResult:{
		AttackWin:"attackWin",
		DefenceWin:"defenceWin"
	},
	MarchType:{
		Village:"village",
		City:"city",
		Shrine:"shrine",
		HelpDefence:"helpDefence"
	},
	GachaType:{
		Normal:"normal",
		Advanced:"advanced"
	},
	OnlineTimePoint:{
		M15:1,
		M30:2,
		M60:3,
		M120:4
	},
	DragonFightBuffTerrain:{
		redDragon:"grassLand",
		blueDragon:"desert",
		greenDragon:"iceField"
	},
	ResourceTechNameMap:{
		wood:"forestation",
		stone:"stoneCarving",
		iron:"ironSmelting",
		food:"cropResearch"
	},
	ResourceBuildingMap:{
		wood:"lumbermill",
		stone:"stoneMason",
		iron:"foundry",
		food:"mill"
	},
	ResourceHouseMap:{
		wood:"woodcutter",
		stone:"quarrier",
		iron:"miner",
		food:"farmer",
		coin:"dwelling"
	},
	BuildingHouseMap:{
		lumbermill:"woodcutter",
		stoneMason:"quarrier",
		foundry:"miner",
		mill:"farmer",
		dwelling:"townHall"
	},
	HouseBuildingMap:{
		woodcutter:"lumbermill",
		quarrier:"stoneMason",
		miner:"foundry",
		farmer:"mill",
		dwelling:"townHall"
	},
	MilitaryItemEventTypes:[
		"masterOfDefender",
		"fogOfTrick",
		"dragonExpBonus",
		"troopSizeBonus",
		"dragonHpBonus",
		"marchSpeedBonus",
		"unitHpBonus",
		"infantryAtkBonus",
		"cavalryAtkBonus",
		"siegeAtkBonus"
	],
	DailyTaskTypes:{
		EmpireRise:"empireRise",
		Conqueror:"conqueror",
		BrotherClub:"brotherClub",
		GrowUp:"growUp"
	},
	DailyTaskIndexMap:{
		EmpireRise:{
			UpgradeBuilding:1,
			RecruitSoldiers:2,
			UpgradeTech:3,
			PassSelinasTest:4,
			MakeBuildingMaterials:5
		},
		Conqueror:{
			JoinAllianceShrineEvent:1,
			StrikeEnemyPlayersCity:2,
			AttackEnemyPlayersCity:3,
			OccupyVillage:4,
			StartPve:5
		},
		BrotherClub:{
			DonateToAlliance:1,
			BuyItemInAllianceShop:2,
			HelpAllianceMemberSpeedUp:3,
			SwitchVillageOccupant:4,
			HelpAllianceMemberDefence:5
		},
		GrowUp:{
			SpeedupBuildingBuild:1,
			SpeedupSoldiersRecruit:2,
			MakeDragonEquipment:3,
			AdvancedGachaOnce:4,
			BuyItemInShop:5
		}
	},
	GrowUpTaskTypes:{
		CityBuild:"cityBuild",
		DragonLevel:"dragonLevel",
		DragonStar:"dragonStar",
		DragonSkill:"dragonSkill",
		ProductionTech:"productionTech",
		MilitaryTech:"militaryTech",
		SoldierStar:"soldierStar",
		SoldierCount:"soldierCount",
		PveCount:"pveCount",
		AttackWin:"attackWin",
		StrikeWin:"strikeWin",
		PlayerKill:"playerKill",
		PlayerPower:"playerPower"
	},
	RankTypes:{
		Power:"power",
		Kill:"kill"
	},
	GemAddFrom:{
		Sys:"sys",
		Iap:"iap"
	},
	TerrainDragonMap:{
		grassLand:"greenDragon",
		desert:"redDragon",
		iceField:"blueDragon"
	},



	AllianceLanguage:{
		All:"all",
		Cn:"cn",
		Tw:"tw",
		En:"en",
		Fr:"fr",
		De:"de",
		Ko:"ko",
		Ja:"ja",
		Ru:"ru",
		Es:"es",
		Pt:"pt"
	},
	AllianceTerrain:{
		GrassLand:"grassLand",
		Desert:"desert",
		IceField:"iceField"
	},
	AllianceJoinType:{
		All:"all",
		Audit:"audit"
	},
	AllianceTitle:{
		Archon:"archon",
		General:"general",
		Quartermaster:"quartermaster",
		Supervisor:"supervisor",
		Elite:"elite",
		Member:"member"
	},
	AllianceJoinStatus:{
		Pending:"pending",
		Reject:"reject"
	},
	AllianceHelpEventType:{
		BuildingEvents:"buildingEvents",
		HouseEvents:"houseEvents",
		ProductionTechEvents:"productionTechEvents",
		MilitaryTechEvents:"militaryTechEvents",
		SoldierStarEvents:"soldierStarEvents"
	},
	AllianceEventCategory:{
		Normal:"normal",
		Important:"important",
		War:"war"
	},
	AllianceEventType:{
		Donate:"donate",//捐赠
		PromotionUp:"promotionUp",//升级
		PromotionDown:"promotionDown",//降级
		Join:"join",//新成员加入
		Kick:"kick",//踢出玩家
		Quit:"quit",//玩家退出
		Request:"request",//玩家申请
		Notice:"notice",//联盟公告
		Desc:"desc",//联盟描述
		Diplomacy:"diplomacy",//外交关系
		HandOver:"handover",//转让盟主
		Tools:"tools",//补充道具
		Upgrade:"upgrade",//联盟建筑升级
		Name:"name",//联盟名字修改
		Tag:"tag",//联盟Tag修改
		Flag:"flag",//联盟旗帜修改
		Terrain:"terrain",//联盟地形修改
		Language:"language",//联盟语言修改
		Gve:"gve"//联盟圣地事件
	},
	AllianceBuildingNames:{
		Palace:"palace",//联盟宫殿
		MoonGate:"moonGate",//月门
		OrderHall:"orderHall",//秩序大厅
		Shrine:"shrine",//圣地
		Shop:"shop"//联盟商店
	},
	DragonStrikeReportLevel:{
		E:1,
		D:2,
		C:3,
		B:4,
		A:5,
		S:6
	},
	AllianceStatus:{
		Peace:"peace",
		Prepare:"prepare",
		Fight:"fight",
		Protect:"protect"
	},
	AllianceStatusEvent:"allianceStatusEvent",
	PlayerReportType:{
		StrikeCity:"strikeCity",
		CityBeStriked:"cityBeStriked",
		AttackCity:"attackCity",
		AttackVillage:"attackVillage",
		StrikeVillage:"strikeVillage",
		VillageBeStriked:"villageBeStriked",
		CollectResource:"collectResource"
	},
	AllianceMergeStyle:{
		Left:"left",
		Right:"right",
		Top:"top",
		Bottom:"bottom"
	},
	AllianceViewDataKeys:[
		"basicInfo",
		"members",
		"buildings",
		"villages",
		"mapObjects",
		"villageEvents",
		"strikeMarchEvents",
		"strikeMarchReturnEvents",
		"attackMarchEvents",
		"attackMarchReturnEvents"
	],
	AllianceItemLogType:{
		AddItem:"addItem",
		BuyItem:"buyItem"
	}
}