"use strict"

/**
 * Created by modun on 14-8-7.
 */

module.exports = {
	LogicChannelName:"logicChannel",
	GloablChatChannelName:"globalChatChannel",
	AllianceChannelPrefix:"allianceChannel_",
	PushServiceName:"pushService",
	CallbackService:"callbackService",
	None:"__NONE__",
	BuildingType:{
		Building:"building",
		House:"house",
		Tower:"tower",
		Wall:"wall"
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
		TowerEvents:"towerEvents",
		WallEvents:"wallEvents",
		ProductionTechEvents:"productionTechEvents",
		MilitaryTechEvents:"militaryTechEvents",
		SoldierStarEvents:"soldierStarEvents"
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
		TowerEvents:"towerEvents",
		WallEvents:"wallEvents",
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
		Promotion:"promotion",//升级,降级
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
	AllianceBuildingLocation:{
		Palace:{x:11, y:11},
		MoonGate:{x:11, y:14},
		OrderHall:{x:8, y:11},
		Shrine:{x:11, y:8},
		Shop:{x:14, y:11}
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
	]
}