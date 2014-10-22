"use strict"

var _ = require("underscore")

/**
 * Created by modun on 14-10-22.
 */

module.exports = function(app){
	return new Cron(app)
}
var Cron = function(app){
	this.app = app
	this.playerService = this.app.get("playerService")
	this.playerDao = this.playerService.playerDao
	this.allianceDao = this.playerService.allianceDao
}
var pro = Cron.prototype

pro.resetDonateStatus = function(){
	var self = this
	this.allianceDao.findAllAsync().then(function(docs){
		_.each(docs, function(doc){
			_.each(doc.members, function(member){
				var donateStatus = {
					wood:1,
					stone:1,
					iron:1,
					food:1,
					coin:1,
					gem:1
				}
				member.donateStatus = donateStatus
			})
		})
		return self.allianceDao.updateAllAsync(docs)
	}).then(function(){
		console.warn("updateAll success")
	}).catch(function(e){
		console.warn(e)
	})
}