"use strict"
/**
 * Created by modun on 15/8/17.
 */

var _ = require('underscore');
var Promise = require('bluebird');

var Consts = require('../../../consts/consts');
var GameData = require('../../../datas/GameDatas');
var ErrorUtils = require('../../../utils/errorUtils');
var Items = GameData.Items;

var MailRewardTypes = {
	items:(function(){
		var theItems = [];
		theItems = theItems.concat(_.keys(Items.special));
		theItems = theItems.concat(_.keys(Items.buff));
		theItems = theItems.concat(_.keys(Items.resource));
		theItems = theItems.concat(_.keys(Items.speedup));
		return theItems;
	})(),
	technologyMaterials:['trainingFigure', 'bowTarget', 'saddle', 'ironPart'],
	buildingMaterials:['blueprints', 'tools', 'tiles', 'pulley'],
	soldierMaterials:['deathHand', 'heroBones', 'soulStone', 'magicBox', 'confessionHood', 'brightRing', 'holyBook', 'brightAlloy'],
	dragonEquipments:[
		'redCrown_s1', 'blueCrown_s1', 'greenCrown_s1',
		'redCrown_s2', 'blueCrown_s2', 'greenCrown_s2',
		'redCrown_s3', 'blueCrown_s3', 'greenCrown_s3',
		'redCrown_s4', 'blueCrown_s4', 'greenCrown_s4',
		'redCrown_s5', 'blueCrown_s5', 'greenCrown_s5',
		'redChest_s2', 'blueChest_s2', 'greenChest_s2',
		'redChest_s3', 'blueChest_s3', 'greenChest_s3',
		'redChest_s4', 'blueChest_s4', 'greenChest_s4',
		'redChest_s5', 'blueChest_s5', 'greenChest_s5',
		'redSting_s2', 'blueSting_s2', 'greenSting_s2',
		'redSting_s3', 'blueSting_s3', 'greenSting_s3',
		'redSting_s4', 'blueSting_s4', 'greenSting_s4',
		'redSting_s5', 'blueSting_s5', 'greenSting_s5',
		'redOrd_s2', 'blueOrd_s2', 'greenOrd_s2',
		'redOrd_s3', 'blueOrd_s3', 'greenOrd_s3',
		'redOrd_s4', 'blueOrd_s4', 'greenOrd_s4',
		'redOrd_s5', 'blueOrd_s5', 'greenOrd_s5',
		'redArmguard_s1', 'blueArmguard_s1', 'greenArmguard_s1',
		'redArmguard_s2', 'blueArmguard_s2', 'greenArmguard_s2',
		'redArmguard_s3', 'blueArmguard_s3', 'greenArmguard_s3',
		'redArmguard_s4', 'blueArmguard_s4', 'greenArmguard_s4',
		'redArmguard_s5', 'blueArmguard_s5', 'greenArmguard_s5'
	],
	dragonMaterials:[
		'ingo_1', 'ingo_2', 'ingo_3', 'ingo_4',
		'redSoul_2', 'redSoul_3', 'redSoul_4',
		'blueSoul_2', 'blueSoul_3', 'blueSoul_4',
		'greenSoul_2', 'greenSoul_3', 'greenSoul_4',
		'redCrystal_1', 'redCrystal_2', 'redCrystal_3', 'redCrystal_4',
		'blueCrystal_1', 'blueCrystal_2', 'blueCrystal_3', 'blueCrystal_4',
		'greenCrystal_1', 'greenCrystal_2', 'greenCrystal_3', 'greenCrystal_4',
		'runes_1', 'runes_2', 'runes_3', 'runes_4'
	]
}


module.exports = function(app, http){
	var Player = app.get('Player');
	var Alliance = app.get('Alliance');

	http.all('*', function(req, res, next){
		req.logService = app.get('logService');
		req.chatServerId = app.getServerFromConfig('chat-server-1').id;
		next();
	});

	http.post('/send-global-notice', function(req, res){
		req.logService.onGm('/send-global-notice', req.body);

		var servers = req.body.servers;
		var type = req.body.type;
		var content = req.body.content;
		app.rpc.chat.gmApiRemote.sendGlobalNotice.toServer(req.chatServerId, servers, type, content, function(e, resp){
			if(!!e){
				req.logService.onError('/send-global-notice', req.body, e.stack);
				res.json({code:500, data:e.message});
			}else
				res.json(resp);
		})
	})

	http.get('/get-global-chats', function(req, res){
		req.logService.onGm('/get-global-chats', req.query);

		var time = Number(req.query.time);
		app.rpc.chat.gmApiRemote.getGlobalChats.toServer(req.chatServerId, time, function(e, resp){
			if(!!e){
				req.logService.onError('/get-global-chats', req.query, e.stack);
				res.json({code:500, data:e.message});
			}else
				res.json(resp);
		})
	})

	http.post('/send-system-chat', function(req, res){
		req.logService.onGm('/send-system-chat', req.body);

		var content = req.body.content;
		app.rpc.chat.gmApiRemote.sendSysChat.toServer(req.chatServerId, content, function(e, resp){
			if(!!e){
				req.logService.onError('/send-system-chat', req.body, e.stack);
				res.json({code:500, data:e.message});
			}else
				res.json(resp);
		})
	})

	http.get('/get-alliance-chats', function(req, res){
		req.logService.onGm('/get-alliance-chats', req.query);

		var allianceId = req.query.allianceId;
		var time = Number(req.query.time);
		app.rpc.chat.gmApiRemote.getAllianceChats.toServer(req.chatServerId, allianceId, time, function(e, resp){
			if(!!e){
				req.logService.onError('/get-alliance-chats', req.query, e.stack);
				res.json({code:500, data:e.message});
			}else
				res.json(resp);
		})
	})


	http.post('/send-global-mail', function(req, res){
		req.logService.onGm('/send-global-mail', req.body);

		var servers = req.body.servers;
		var title = req.body.title;
		var content = req.body.content;
		var rewards = req.body.rewards;
		if(_.isString(rewards) && rewards.trim().length > 0){
			var rewardStrings = rewards.split(',');
			rewards = [];
			_.each(rewardStrings, function(rewardString){
				var rewardParams = rewardString.split(':');
				var reward = {
					type:rewardParams[0],
					name:rewardParams[1],
					count:parseInt(rewardParams[2])
				}
				rewards.push(reward);
			})
			var hasError = _.some(rewards, function(reward){
				if(!_.contains(_.keys(MailRewardTypes), reward.type)) return true;
				if(!_.contains(MailRewardTypes[reward.type], reward.name)) return true;
				if(_.isNaN(reward.count) || reward.count <= 0) return true;
			})
			if(hasError) return res.json({code:500, data:'rewards数据结构不合法'})
		}else{
			rewards = [];
		}

		_.each(servers, function(serverId){
			if(!!app.getServerById(serverId)) app.rpc.cache.gmApiRemote.sendGlobalMail.toServer(serverId, title, content, rewards, function(){
			})
		})
		return res.json({code:200, data:null});
	})

	http.post('/send-mail-to-players', function(req, res){
		req.logService.onGm('/send-mail-to-players', req.body);

		var players = req.body.players;
		var title = req.body.title;
		var content = req.body.content;
		var rewards = req.body.rewards;
		if(_.isString(rewards) && rewards.trim().length > 0){
			var rewardStrings = rewards.split(',');
			rewards = [];
			_.each(rewardStrings, function(rewardString){
				var rewardParams = rewardString.split(':');
				var reward = {
					type:rewardParams[0],
					name:rewardParams[1],
					count:parseInt(rewardParams[2])
				}
				rewards.push(reward);
			})

			var hasError = _.some(rewards, function(reward){
				if(!_.contains(_.keys(MailRewardTypes), reward.type)) return true;
				if(!_.contains(MailRewardTypes[reward.type], reward.name)) return true;
				if(_.isNaN(reward.count) || reward.count <= 0) return true;
			})
			if(hasError) return res.json({code:500, data:'rewards数据结构不合法'})
		}else{
			rewards = [];
		}


		var serverIds = {};
		Promise.fromCallback(function(callback){
			Player.collection.find({_id:{$in:players}}, {serverId:true}).toArray(function(e, docs){
				callback(e, docs);
			})
		}).then(function(docs){
			_.each(docs, function(doc){
				if(!serverIds[doc.serverId]) serverIds[doc.serverId] = [];
				serverIds[doc.serverId].push(doc._id);
			})
			_.each(serverIds, function(ids, serverId){
				if(!!app.getServerById(serverId)) app.rpc.cache.gmApiRemote.sendMailToPlayers.toServer(serverId, ids, title, content, rewards, function(){
				})
			})
			return Promise.resolve();
		}).then(function(){
			res.json({code:200, data:null});
		}).catch(function(e){
			req.logService.onError('/send-mail-to-players', req.body, e.stack);
			res.json({code:500, data:e.message});
		})
	})

	http.get('/alliance/find-by-id', function(req, res){
		req.logService.onGm('/alliance/find-by-id', req.query);

		var allianceId = req.query.allianceId;
		Alliance.findByIdAsync(allianceId, 'serverId').then(function(doc){
			if(!doc) return Promise.reject(ErrorUtils.allianceNotExist(allianceId));
			if(!app.getServerById(doc.serverId)) return Promise.reject(ErrorUtils.serverUnderMaintain());
			return Promise.fromCallback(function(callback){
				app.rpc.cache.gmApiRemote.findAllianceById.toServer(doc.serverId, doc._id, function(e, resp){
					callback(e, resp);
				})
			})
		}).then(function(resp){
			res.json(resp);
		}).catch(function(e){
			req.logService.onError('/alliance/find-by-id', req.query, e.stack);
			res.json({code:500, data:e.message});
		})
	});

	http.get('/alliance/find-by-tag', function(req, res){
		req.logService.onGm('/alliance/find-by-tag', req.query);

		var allianceTag = req.query.allianceTag;
		Alliance.findOneAsync({'basicInfo.tag':allianceTag}, 'serverId').then(function(doc){
			if(!doc) return Promise.reject(ErrorUtils.allianceNotExist(allianceTag));
			if(!app.getServerById(doc.serverId)) return Promise.reject(ErrorUtils.serverUnderMaintain());
			return Promise.fromCallback(function(callback){
				app.rpc.cache.gmApiRemote.findAllianceById.toServer(doc.serverId, doc._id, function(e, resp){
					callback(e, resp);
				})
			})
		}).then(function(resp){
			res.json(resp);
		}).catch(function(e){
			req.logService.onError('/alliance/find-by-tag', req.query, e.stack);
			res.json({code:500, data:e.message});
		})
	});

	http.get('/player/find-by-id', function(req, res){
		req.logService.onGm('/player/find-by-id', req.query);
		var playerId = req.query.playerId;
		Player.findByIdAsync(playerId, 'serverId').then(function(doc){
			if(!doc) return Promise.reject(ErrorUtils.playerNotExist(playerId));
			if(!app.getServerById(doc.serverId)) return Promise.reject(ErrorUtils.serverUnderMaintain());
			return Promise.fromCallback(function(callback){
				app.rpc.cache.gmApiRemote.findPlayerById.toServer(doc.serverId, doc._id, function(e, resp){
					callback(e, resp);
				})
			})
		}).then(function(resp){
			res.json(resp);
		}).catch(function(e){
			req.logService.onError('/player/find-by-id', req.query, e.stack);
			res.json({code:500, data:e.message});
		})
	});

	http.get('/player/find-by-name', function(req, res){
		req.logService.onGm('/player/find-by-name', req.query);

		var playerName = req.query.playerName;
		Player.findOneAsync({'basicInfo.name':playerName}, 'serverId').then(function(doc){
			if(!doc) return Promise.reject(ErrorUtils.playerNotExist(playerName));
			if(!app.getServerById(doc.serverId)) return Promise.reject(ErrorUtils.serverUnderMaintain());
			return Promise.fromCallback(function(callback){
				app.rpc.cache.gmApiRemote.findPlayerById.toServer(doc.serverId, doc._id, function(e, resp){
					callback(e, resp);
				})
			})
		}).then(function(resp){
			res.json(resp);
		}).catch(function(e){
			req.logService.onError('/player/find-by-name', req.query, e.stack);
			res.json({code:500, data:e.message});
		})
	});

	http.post('/player/ban', function(req, res){
		req.logService.onGm('/player/ban', req.body);

		var serverId = req.body.serverId;
		var playerId = req.body.playerId;
		var time = Number(req.body.time);
		if(_.isNaN(time) || time < 0) return res.json({code:500, data:'Time 不合法'});
		if(time > 0) time += Date.now();

		if(!app.getServerById(serverId)){
			var e = ErrorUtils.serverUnderMaintain();
			return res.json({code:500, data:e.message})
		}
		app.rpc.cache.gmApiRemote.banPlayer.toServer(serverId, playerId, time, function(e, resp){
			if(!!e){
				req.logService.onError('/player/ban', req.body, e.stack);
				res.json({code:500, data:e.message});
			}else{
				res.json(resp);
			}
		})
	})

	http.post('/player/mute', function(req, res){
		req.logService.onGm('/player/mute', req.body);

		var serverId = req.body.serverId;
		var playerId = req.body.playerId;
		var time = Number(req.body.time);
		if(_.isNaN(time) || time < 0) return res.json({code:500, data:'Time 不合法'});
		if(time > 0) time += Date.now();

		if(!app.getServerById(serverId)){
			var e = ErrorUtils.serverUnderMaintain();
			return res.json({code:500, data:e.message})
		}
		app.rpc.cache.gmApiRemote.mutePlayer.toServer(serverId, playerId, time, function(e, resp){
			if(!!e){
				req.logService.onError('/player/ban', req.body, e.stack);
				res.json({code:500, data:e.message});
			}else{
				res.json(resp);
			}
		})
	})

	http.get('/get-mail-reward-types', function(req, res){
		req.logService.onGm('/get-mail-reward-types', req.query);
		res.json({code:200, data:MailRewardTypes})
	})

	http.get('/get-servers-info', function(req, res){
		req.logService.onGm('/get-cache-server-info', req.query);
		var infos = {};
		var funcs = [];
		_.each(app.getServersByType('cache'), function(server){
			funcs.push(Promise.fromCallback(function(callback){
				app.rpc.cache.gmApiRemote.getServerInfo.toServer(server.id, function(e, resp){
					if(!!e){
						req.logService.onError('/get-servers-info', req.query, e.stack);
						infos[server.id] = {code:500, data:e.message};
					}else{
						infos[server.id] = resp;
					}
					callback()
				})
			}))
		})

		Promise.all(funcs).then(function(){
			res.json({code:200, data:infos});
		}).catch(function(e){
			req.logService.onError('/get-servers-info', req.query, e.stack);
			res.json({code:500, data:e.message});
		})
	})
}
