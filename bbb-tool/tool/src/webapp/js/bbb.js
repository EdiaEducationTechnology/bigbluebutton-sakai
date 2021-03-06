/*
 * Copyright (c) 2010-2009 The Sakai Foundation
 *
 * Licensed under the Educational Community License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *             http://www.osedu.org/licenses/ECL-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Stuff that we always expect to be setup */
var bbbSiteId = null;
var bbbSettings = null;
var bbbCurrentUser = null;
var bbbUserTimeZoneOffset = 0;
var bbbBrowserTimeZoneOffset = 0;
var bbbUserPerms = null;
var bbbCurrentMeetings = [];
var bbbCurrentRecordings = Array();
var bbbCheckOneMeetingAvailabilityId = null;
var bbbCheckAllMeetingAvailabilityId = null; 
var bbbCheckRecordingAvailabilityId = null; 
var bbbRefreshRecordingListId = null;
var bbbErrorLog = new Object();

(function() {
    // Setup Ajax defaults
    BBBUtils.setupAjax();
    
    // Process parameters
    var arg = BBBUtils.getParameters(); 
    if (!arg || !arg.siteId) {
        BBBUtils.showMessage(bbb_err_no_siteid, 'error');
        return;
    }
    bbbSiteId = arg.siteId;
    bbbSettings = BBBUtils.getSettings(bbbSiteId);
    bbbCurrentUser = bbbSettings.currentUser;
    bbbUserPerms = new BBBPermissions(bbbCurrentUser.permissions);
    bbbUserTimeZoneOffset = arg.timezoneoffset;
    var d = new Date();
    bbbBrowserTimeZoneOffset = d.getTimezoneOffset() * 60 * 1000 * -1;
    
    // We need the toolbar in a template so we can swap in the translations
    BBBUtils.render('bbb_toolbar_template',{},'bbb_toolbar');
    
    $('#bbb_home_link').bind('click',function(e) {
        return switchState('currentMeetings');
    });

    $('#bbb_permissions_link').bind('click',function(e) {
        return switchState('permissions');
    });

    $('#bbb_recordings_link').bind('click',function(e) {
        return switchState('recordings');
    });
    
    // This is always showing in every state.
    $('#bbb_home_link').show();
    $('#bbb_recordings_link').show();

    // Now switch into the requested state
    if (bbbCurrentUser != null) {
        switchState(arg.state,arg);
    } else {
        BBBUtils.showMessage(bbb_err_no_user, 'error');
        jQuery('#bbb_container').empty();
    }
    
    // If configured, show text notice (first time access)
    BBBUtils.addNotice();
})();

function switchState(state,arg) {
	if ( bbbCheckOneMeetingAvailabilityId != null ) clearInterval(bbbCheckOneMeetingAvailabilityId);
	if ( bbbCheckAllMeetingAvailabilityId != null ) clearInterval(bbbCheckAllMeetingAvailabilityId);
	if ( bbbCheckRecordingAvailabilityId != null ) clearInterval(bbbCheckRecordingAvailabilityId);
	if ( bbbRefreshRecordingListId != null ) clearInterval(bbbRefreshRecordingListId);
	
    BBBUtils.hideMessage();
    
    //Clean navbar button state
    $("#bbb_toolbar_items li>span").removeClass('current');
    
    if ('currentMeetings' === state) {
    	$("#bbb_home_link").parent().addClass('current');
        $('#bbb_recordings_link').parent().parent().show();
        
        // show permissions links only if site maintainer
        if (bbbUserPerms.bbbAdmin) {
            $('#bbb_permissions_link').parent().parent().show();
        } else {
            $('#bbb_permissions_link').parent().parent().hide();
        }
        
        if (bbbUserPerms.bbbDeleteAny) {
            $('#bbb_end_meetings_link').parent().parent().show();        
        } else {
            $('#bbb_end_meetings_link').parent().parent().hide();         
        }
        
        // show meeting list
        if (bbbUserPerms.bbbViewMeetingList) {
            // Set meeting list
            setMeetingList();

            // Show meeting list
            BBBUtils.render('bbb_rooms_template',{'meetings':bbbCurrentMeetings},'bbb_content');

            // Update meeting list
            refreshMeetingList();

            // show tool footer message only if site maintainer
            if (bbbUserPerms.siteUpdate) {
                bbbToolVersion = bbbSettings.toolVersion;
                BBBUtils.render('bbb_toolfooter_template',{'bbbTool':bbbToolVersion},'bbb_footer');
            }

            $('#bbb_create_meeting_link').bind('click',function(e) {
                return switchState('addUpdateMeeting');
            });

            // show links if user has appropriate permissions
            if (bbbUserPerms.bbbCreate) {
                $('#bbb_create_meeting_link').show();
            } else {
                $('#bbb_create_meeting_link').hide();
            }

            $(document).ready(function() {
                BBBUtils.adjustFrameHeight();

                // auto hide actions
                jQuery('.meetingRow')
                    .bind('mouseenter', function() {
                        jQuery(this).find('div.itemAction').show();
                        jQuery(this).addClass('bbb_even_row');
                    })
                    .bind('mouseleave', function() {
                        jQuery(this).find('div.itemAction').hide();
                        jQuery(this).removeClass('bbb_even_row');
                    }
                );
                
                // Add parser for customized date format
            	$.tablesorter.addParser({
            	    id: "bbbDateTimeFormat",
            	    is: function(s) {
            	        return false; 
            	    },
            	    format: function(s,table) {
            	        return $.tablesorter.formatFloat(new Date(s).getTime());
            	    },
            	    type: "numeric"
            	});
                
                // add sorting capabilities
                $("#bbb_meeting_table").tablesorter({
                    cssHeader:'bbb_sortable_table_header',
                    cssAsc:'bbb_sortable_table_header_sortup',
                    cssDesc:'bbb_sortable_table_header_sortdown',
                    headers: { 2: { sorter: 'bbbDateTimeFormat'}, 3: { sorter: 'bbbDateTimeFormat'} },
                    // Sort DESC status:
                    sortList: (bbbCurrentMeetings.length > 0) ? [[0,1]] : []
                });
            });

            if (bbbSettings.config.autorefreshInterval.meetings > 0)
                bbbCheckAllMeetingAvailabilityId = setInterval("BBBUtils.checkAllMeetingAvailability()", bbbSettings.config.autorefreshInterval.meetings);

        } else {
            // warn about lack of permissions
            if (bbbUserPerms.siteUpdate) {
                BBBUtils.showMessage(bbb_err_no_tool_permissions_maintainer);
            } else {
                BBBUtils.showMessage(bbb_err_no_tool_permissions);
            }
            $('#bbb_content').empty();
        }

    } else if ('addUpdateMeeting' === state) {
        $('#bbb_recordings_link').parent().parent().hide();
        $('#bbb_end_meetings_link').parent().parent().hide();
        $('#bbb_permissions_link').parent().parent().hide();

        var isNew = !(arg && arg.meetingId); 
        var meeting = isNew ? {} : BBBUtils.getMeeting(arg.meetingId);
        var contextData = {
                'isNew':        isNew,
                'meeting':      meeting,
                'selTypes':     BBBUtils.getUserSelectionTypes(),
                'selOptions':   BBBUtils.getUserSelectionOptions(),
                'siteId':       bbbSiteId,
                'recordingEnabled': 	bbbSettings.config.addUpdateFormParameters.recordingEnabled,
                'recordingDefault':     bbbSettings.config.addUpdateFormParameters.recordingDefault,
                'durationEnabled':      bbbSettings.config.addUpdateFormParameters.durationEnabled,
                'durationDefault':      bbbSettings.config.addUpdateFormParameters.durationDefault,
                'waitmoderatorEnabled': bbbSettings.config.addUpdateFormParameters.waitmoderatorEnabled,
                'waitmoderatorDefault': bbbSettings.config.addUpdateFormParameters.waitmoderatorDefault,
                'multiplesessionsallowedEnabled': bbbSettings.config.addUpdateFormParameters.multiplesessionsallowedEnabled,
                'multiplesessionsallowedDefault': bbbSettings.config.addUpdateFormParameters.multiplesessionsallowedDefault,
                'actionUrl':    isNew ? "/direct/bbb-tool/new" : "/direct/bbb-tool/"+meeting.id+"/edit"
        };
        BBBUtils.render('bbb_addUpdate_meeting_template', contextData, 'bbb_content');

        $(document).ready(function() {
            BBBUtils.adjustFrameHeight();

            // Focus on meeting name/title
            $('#bbb_meeting_name_field').focus();

            // Setup description/welcome msg editor. Depending of the sakai version it will use CKEditor or FCKEditor
            var sakaiVersionArr = sakaiVersion.split('.');
            var descriptionType = bbbSettings.config.addUpdateFormParameters.descriptionType;
            if( descriptionType == 'fckeditor' || descriptionType == 'ckeditor' ) {
                if ( parseInt(sakaiVersionArr[0]) == 2 && parseInt(sakaiVersionArr[1]) >= 8)
                    BBBUtils.makeInlineCKEditor('bbb_welcome_message_textarea', 'BBB', '480', '200');
                else
                    BBBUtils.makeInlineFCKEditor('bbb_welcome_message_textarea', 'Basic', '480', '200');
            }

            // Setup dates
            var now = new Date(); 
            var now_utc = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
            var now_local = new Date(parseInt(now_utc.getTime()) + parseInt(bbbUserTimeZoneOffset));
            var now_local_plus_1 = new Date(parseInt(now_utc.getTime()) + parseInt(bbbUserTimeZoneOffset) + 3600000);

            var startDate = (!isNew && meeting.startDate) ? new Date(parseInt(meeting.startDate) - parseInt(bbbBrowserTimeZoneOffset) + parseInt(bbbUserTimeZoneOffset) + ( (new Date()).dst() && !(new Date( parseInt(meeting.startDate) - parseInt(bbbBrowserTimeZoneOffset) + parseInt(bbbUserTimeZoneOffset))).dst()? 3600000: !(new Date()).dst() && (new Date( parseInt(meeting.startDate) - parseInt(bbbBrowserTimeZoneOffset) + parseInt(bbbUserTimeZoneOffset))).dst()? (3600000 * -1): 0 ) ) : now_local;
            var endDate = (!isNew && meeting.endDate) ? new Date(parseInt(meeting.endDate) - parseInt(bbbBrowserTimeZoneOffset) + parseInt(bbbUserTimeZoneOffset) + ( (new Date()).dst() && !(new Date( parseInt(meeting.endDate) - parseInt(bbbBrowserTimeZoneOffset) + parseInt(bbbUserTimeZoneOffset))).dst()? 3600000: !(new Date()).dst() && (new Date( parseInt(meeting.endDate) - parseInt(bbbBrowserTimeZoneOffset) + parseInt(bbbUserTimeZoneOffset))).dst()? (3600000 * -1): 0 ) ) : now_local_plus_1;

            // Setup time picker
            var zeropad = function (num) { return ((num < 10) ? '0' : '') + num; }
            jQuery('#startTime').val(zeropad(startDate.getHours()) +':'+ zeropad(startDate.getMinutes()));
            jQuery('#endTime').val(zeropad(endDate.getHours()) +':'+ zeropad(endDate.getMinutes()));
            jQuery(".time-picker").remove();
            jQuery("#startTime, #endTime").timePicker({separator:':'});

            // Setup date picker
            jQuery.datepick.setDefaults({
                dateFormat:         jQuery.datepick.W3C,
                defaultDate:        '+0',
                showDefault:        true,
                showOn:             'both', 
                buttonImageOnly:    true,
                buttonImage:        '/library/calendar/images/calendar/cal.gif'
            });
            jQuery('#startDate2, #endDate2').datepick();
            jQuery('#startDate2').datepick('setDate', startDate);
            jQuery('#endDate2').datepick('setDate', endDate);

            // Add meeting participants
            addParticipantSelectionToUI(meeting, isNew);

            // Setup form submission
            jQuery("#bbb_add_update_form").submit(function() {
                BBBUtils.addUpdateMeeting();
                return false;
            });

            // User warnings
            if (!allSiteMembersCanParticipate()) {
                 BBBUtils.showMessage(bbb_err_not_everyone_can_participate);
            }
        });

    } else if ('permissions' === state) {
    	$("#bbb_permissions_link").parent().addClass('current');

        BBBUtils.render('bbb_permissions_template', {'permissions': BBBUtils.getSitePermissions()}, 'bbb_content');

        $(document).ready(function() {
            BBBUtils.adjustFrameHeight();

            $('#bbb_permissions_save_button').bind('click', function() {
               BBBUtils.setSitePermissions('.bbb_permission_checkbox', function() {
                   // success callback
                   bbbUserPerms = new BBBPermissions(bbbCurrentUser.permissions);
                   if (bbbUserPerms.bbbViewMeetingList)
                       setMeetingList();
                   switchState('currentMeetings');
                   if (bbbUserPerms.bbbViewMeetingList)
                        BBBUtils.showMessage(bbb_permissions_saved, 'success');
               })
            });
        });
    } else if ('joinMeeting' === state || 'meetingInfo' === state) {
        if ('joinMeeting' === state ) setMeetingList();
        $('#bbb_recordings_link').parent().parent().hide();
        $('#bbb_end_meetings_link').parent().parent().hide();
        $('#bbb_permissions_link').parent().parent().hide();

        if (arg && arg.meetingId) {
            var meeting = null;
            for(var i=0,j=bbbCurrentMeetings.length;i<j;i++) {
                if ( bbbCurrentMeetings[i].id == arg.meetingId ) {
                    meeting = bbbCurrentMeetings[i];
                    break;
                }
            }

            if (meeting) {
                BBBUtils.render('bbb_meeting-info_template', {'meeting' : meeting}, 'bbb_content');
			    $(document).ready(function() {
			        BBBUtils.adjustFrameHeight();
			        BBBUtils.checkOneMeetingAvailability(arg.meetingId);
			        BBBUtils.checkRecordingAvailability(arg.meetingId);
			    });

			    if (bbbSettings.config.autorefreshInterval.meetings > 0)
			        bbbCheckOneMeetingAvailabilityId = setInterval(	"BBBUtils.checkOneMeetingAvailability('" + arg.meetingId + "')", bbbSettings.config.autorefreshInterval.meetings);
			        //bbbCheckRecordingAvailabilityId = setInterval( "BBBUtils.checkRecordingAvailability('" + arg.meetingId + "')", bbbSettings.config.autorefreshInterval.recordings);

            } else {
                BBBUtils.adjustFrameHeight();
                BBBUtils.hideMessage();
                BBBUtils.showMessage(bbb_err_meeting_unavailable_instr,	'warning', bbb_err_meeting_unavailable, false);
            }
        } else {
            switchState('currentMeetings');
        }
    } else if ('recordings' === state) {
    	$("#bbb_recordings_link").parent().addClass('current');

        // show meeting list
        if (bbbUserPerms.bbbViewMeetingList) {
            // Get recording list
        	refreshRecordingList();

        	// watch for permissions changes, check meeting dates
            for(var i=0,j=bbbCurrentRecordings.length;i<j;i++) {
                BBBUtils.setRecordingPermissionParams(bbbCurrentRecordings[i]);
            }

            BBBUtils.render('bbb_recordings_template',{'recordings':bbbCurrentRecordings,'stateFunction':'recordings'},'bbb_content');

            $(document).ready(function() {
                BBBUtils.adjustFrameHeight();

                // auto hide actions
                jQuery('.recordingRow')
                    .bind('mouseenter', function() {
                        jQuery(this).find('div.itemAction').show();
                        jQuery(this).addClass('bbb_even_row');
                    })
                    .bind('mouseleave', function() {
                        jQuery(this).find('div.itemAction').hide();
                        jQuery(this).removeClass('bbb_even_row');
                    }
                );

                // Add parser for customized date format
                $.tablesorter.addParser({
                    id: "bbbDateTimeFormat",
                    is: function(s) {
                        return false; 
                    },
                    format: function(s,table) {
                        return $.tablesorter.formatFloat(new Date(s).getTime());
                    },
                    type: "numeric"
                });

                // add sorting capabilities
                $("#bbb_recording_table").tablesorter({
                    cssHeader:'bbb_sortable_table_header',
                    cssAsc:'bbb_sortable_table_header_sortup',
                    cssDesc:'bbb_sortable_table_header_sortdown',
                    headers: { 2: { sorter: 'bbbDateTimeFormat'}, 3: { sorter: false}, 4: { sorter: false} },
                    // Sort DESC status:
                    sortList: (bbbCurrentMeetings.length > 0) ? [[2,1]] : []
                    //headers: { 2: { sorter: 'bbbDateTimeFormat'} },
                    //// Sort DESC status:
                    //sortList: (bbbCurrentRecordings.length > 0) ? [[0,0]] : []
                    //headers: { 2: { sorter: 'bbbDateTimeFormat'} },
                    //// Sort DESC status:
                    //sortList: (bbbCurrentRecordings.length > 0) ? [[0,0]] : []
                });
            });

            if (bbbSettings.config.autorefreshInterval.recordings > 0)
                bbbRefreshRecordingListId = setInterval("switchState('recordings')", bbbSettings.config.autorefreshInterval.recordings);
        } else {
            // warn about lack of permissions
            if (bbbUserPerms.siteUpdate) {
                BBBUtils.showMessage(bbb_err_no_tool_permissions_maintainer);
            } else {
                BBBUtils.showMessage(bbb_err_no_tool_permissions);
            }
            $('#bbb_content').empty();
        }
    } else if ('recordings_meeting' === state) {
        $("#bbb_recordings_link").parent().addClass('current inactive');

        if (arg && arg.meetingId) {
            if (bbbUserPerms.bbbViewMeetingList) {
                // Get meeting list
                refreshRecordingList(arg.meetingId);

                // watch for permissions changes, check meeting dates
                for(var i=0,j=bbbCurrentRecordings.length;i<j;i++) {
                    bbbCurrentRecordings[i].ownerId = "";
                    BBBUtils.setRecordingPermissionParams(bbbCurrentRecordings[i]);
                }

                BBBUtils.render('bbb_recordings_template',{'recordings':bbbCurrentRecordings, 'stateFunction':'recordings_meeting'},'bbb_content');

                $(document).ready(function() {
                    BBBUtils.adjustFrameHeight();

                    // auto hide actions
                    jQuery('.recordingRow')
                        .bind('mouseenter', function() {
                            jQuery(this).find('div.itemAction').show();
    	                    jQuery(this).addClass('bbb_even_row');
                        })
                        .bind('mouseleave', function() {
                            jQuery(this).find('div.itemAction').hide();
                            jQuery(this).removeClass('bbb_even_row');
                        }
                    );

                    // Add parser for customized date format
                    $.tablesorter.addParser({
                        id: "bbbDateTimeFormat",
                        is: function(s) {
                            return false; 
                        },
                        format: function(s,table) {
                            return $.tablesorter.formatFloat(new Date(s).getTime());
                        },
                        type: "numeric"
                    });

                    // add sorting capabilities
                    $("#bbb_recording_table").tablesorter({
                        cssHeader:'bbb_sortable_table_header',
                        cssAsc:'bbb_sortable_table_header_sortup',
                        cssDesc:'bbb_sortable_table_header_sortdown',
                        headers: { 2: { sorter: 'bbbDateTimeFormat'}, 3: { sorter: false}, 4: { sorter: false} },
                        // Sort DESC status:
                        sortList: (bbbCurrentMeetings.length > 0) ? [[2,1]] : []
                        //headers: { 2: { sorter: 'bbbDateTimeFormat'} },
                        //// Sort DESC status:
                        //sortList: (bbbCurrentRecordings.length > 0) ? [[0,0]] : []
                    });
                });

                if (bbbSettings.config.autorefreshInterval.recordings > 0)
                    bbbRefreshRecordingListId = setInterval("switchState('recordings_meeting',{'meetingId':'" + arg.meetingId + "'})", bbbSettings.config.autorefreshInterval.recordings);
            } else {
                // warn about lack of permissions
                if (bbbUserPerms.siteUpdate) {
                    BBBUtils.showMessage(bbb_err_no_tool_permissions_maintainer);
                } else {
                    BBBUtils.showMessage(bbb_err_no_tool_permissions);
                }
                $('#bbb_content').empty();
            }
        } else {
            switchState('recordings');
        }
    }
}

function allSiteMembersCanParticipate() {
    var perms = BBBUtils.getSitePermissions();
    var totalRoles = perms.length;
    var totalRolesThatCanParticipate = 0;
    for(var r=0; r<perms.length; r++) {
        if (perms[r].bbb_participate) totalRolesThatCanParticipate++;
    }
    return totalRoles == totalRolesThatCanParticipate;
}

function addParticipantSelectionToUI(meeting, isNew) {
    var selOptions = BBBUtils.getUserSelectionOptions();
	if (isNew) {
		var defaults = selOptions['defaults'];

        // meeting creator (default: as moderator)
		var ownerDefault = defaults['bbb.default.participants.owner'];
		if (ownerDefault != 'none') {
            addParticipantRow('user', bbbCurrentUser.id, bbbCurrentUser.displayName +' ('+bbbCurrentUser.displayId+')', ownerDefault == 'moderator');
		}

        // all site participants (default: none)
		var allUsersDefault = defaults['bbb.default.participants.all_users'];
        if (allUsersDefault != 'none') {
            addParticipantRow('all', null, null, allUsersDefault == 'moderator');
        }

    } else {
    	// existing participants
        for(var i=0; i<meeting.participants.length; i++) {
            var selectionType = meeting.participants[i].selectionType;
            var selectionId = meeting.participants[i].selectionId;
            var role = meeting.participants[i].role;
            
            if (selectionType == 'all') {
                addParticipantRow('all', null, null, role == 'moderator');

            } else {
                var opts = null;
                if (selectionType == 'user') opts = selOptions['users'];
                if (selectionType == 'group') opts = selOptions['groups'];
                if (selectionType == 'role') opts = selOptions['roles'];
                
                for(var n=0; n<opts.length; n++) {
                    if (opts[n]['id'] == selectionId) {
                    	addParticipantRow(selectionType, selectionId, opts[n]['title'], role == 'moderator');
                        break;
                    }
                }
            
            }
        }
    }
}

function updateParticipantSelectionUI() {
    var selOptions = BBBUtils.getUserSelectionOptions();
    var selType = jQuery('#selType').val();
    jQuery('#selOption option').remove();
    
    if (selType == 'user' || selType == 'group' || selType == 'role') {
        var opts = null;
        if (selType == 'user') opts = selOptions['users'];
        if (selType == 'group') opts = selOptions['groups'];
        if (selType == 'role') opts = selOptions['roles'];
        for(var i=0; i<opts.length; i++) {
            jQuery('#selOption').append(
              '<option value="'+ opts[i]['id'] +'">'+ opts[i]['title'] +'</option>'
            );
        }

        $("#selOption").html($("#selOption option").sort(function (a, b) {
            return a.text == b.text ? 0 : a.text < b.text ? -1 : 1
        }));

        jQuery('#selOption').removeAttr('disabled');
    } else {
        jQuery('#selOption').attr('disabled','disabled');
    }
}

/** Insert a Participant row on create/edit meeting page */
function addParticipantRow(_selType, _id, _title, _moderator) {
    var selectionType = _selType + '_' + _id;
    var selectionId = _selType + '-' + 'role_' + _id;
    var selectionTitle = null;
    if (_selType == 'all') selectionTitle = '<span class="bbb_role_selection">'+ bbb_seltype_all +'</span>';
    if (_selType == 'group') selectionTitle = '<span class="bbb_role_selection">'+ bbb_seltype_group + ':</span> ' + _title;
    if (_selType == 'role') selectionTitle = '<span class="bbb_role_selection">'+ bbb_seltype_role + ':</span> ' + _title;
    if (_selType == 'user') selectionTitle = '<span class="bbb_role_selection">'+ bbb_seltype_user + ':</span> ' + _title;
    var moderatorSelection = _moderator ? ' selected' : '';
    var attendeeSelection = _moderator ? '' : ' selected';

    var trId = 'row-' + _selType + '-' + _id;
    var trRowClass = 'row-' + _selType;
    if (jQuery('#'+trId).length == 0) {
        var row = jQuery(
            '<tr id="'+ trId +'" class="' + trRowClass + '" style="display:none">'+
                '<td>'+
                    '<a href="#" title="'+bbb_remove+'" onclick="jQuery(this).parent().parent().remove();return false"><img src="/library/image/silk/cross.png" alt="X" style="vertical-align:middle"/></a>&nbsp;'+
                    selectionTitle +
                '</td>'+
                '<td>'+
                    '<span class="bbb_role_selection_as">'+bbb_as_role+'</span>'+
                    '<select name="'+ selectionId +'"><option value="attendee"'+ attendeeSelection +'>'+ bbb_role_atendee +'</option><option value="moderator"'+ moderatorSelection +'>'+ bbb_role_moderator +'</option></select>'+
                    '<input type="hidden" name="'+ selectionType +'" value="'+ _id +'"/>'+
                '</td>'+
            '</tr>');        
        if (jQuery('table#selContainer tbody tr.'+trRowClass+':last').size() > 0)
            jQuery('table#selContainer tbody tr.'+trRowClass+':last').after(row);
        else
            jQuery('table#selContainer tbody').append(row);
        row.fadeIn();
        BBBUtils.adjustFrameHeight();
    } else {
    	jQuery('#'+trId).animate({opacity:'hide'}, 'fast', function() {
            jQuery('#'+trId).animate({opacity:'show'}, 'slow');
        });
    }
}

function updateMeetingInfo(meeting) {
    jQuery('#bbb_meeting_info_participants_count').html('?');
    var meetingInfo = meeting;
    if (meetingInfo != null) {
        if (meetingInfo.participantCount != null && parseInt(meetingInfo.participantCount) >= 0) {
            // prepare participant count text
            var attendeeCount = meetingInfo.participantCount - meetingInfo.moderatorCount;
            var moderatorCount = meetingInfo.moderatorCount;
            var attendeeText = attendeeCount + ' ' + (attendeeCount == 1 ? bbb_meetinginfo_participants_atendee : bbb_meetinginfo_participants_atendees);
            var moderatorText = moderatorCount + ' ' + (moderatorCount == 1 ? bbb_meetinginfo_participants_moderator : bbb_meetinginfo_participants_moderators);
            // prepare participant links
            if (attendeeCount > 0) {
                var attendees = '';
                for(var p=0; p<meetingInfo.attendees.length; p++) {
                    if (meetingInfo.attendees[p].role == 'VIEWER') {
                        if (attendees != '')
                            attendees += ', ' + meetingInfo.attendees[p].fullName;
                        else
                            attendees = meetingInfo.attendees[p].fullName;
                    }
            	}            	   
                attendeeText = '<a id="attendees" title="'+attendees+'" href="javascript:;" onclick="return false;">'+ attendeeText +'</a>';            	
            }
            if (moderatorCount > 0) {
                var moderators = '';
                for(var p=0; p<meetingInfo.attendees.length; p++) {
                   if (meetingInfo.attendees[p].role == 'MODERATOR') {
                       if (moderators != '')
                           moderators += ', ' + meetingInfo.attendees[p].fullName;
                       else
                           moderators = meetingInfo.attendees[p].fullName;
                   }
                }
                moderatorText = '<a id="moderators" title="'+moderators+'" href="javascript:;" onclick="return false;">'+ moderatorText +'</a>';
            }
            var countText = meetingInfo.participantCount > 0
			                ? meetingInfo.participantCount + ' (' + attendeeText + ' + ' + moderatorText + ')'
			                : '0';
            // update participant info & tooltip
			jQuery('#bbb_meeting_info_participants_count').html(countText);
			jQuery('#attendees, #moderators').tipTip({
			     activation:'click', 
			     keepAlive:'true', 
			     enter:function(){ setTimeout("BBBUtils.adjustFrameHeight();",1000); }
			});

            for(var p=0; p<meetingInfo.attendees.length; p++) {
                if (!meeting.multipleSessionsAllowed && bbbCurrentUser.id === meetingInfo.attendees[p].userID) {
					$('#meeting_joinlink_' + meeting.id).hide();
				}
          	}
		} else if (meetingInfo.participantCount == null || parseInt(meetingInfo.participantCount) == -1){
            jQuery('#bbb_meeting_info_participants_count_tr').hide();
            return;
		} else {
			jQuery('#bbb_meeting_info_participants_count').html('0');
		}
	    jQuery('#bbb_meeting_info_participants_count_tr').fadeIn();
	} else {
	    jQuery('#bbb_meeting_info_participants_count_tr').hide();
	}
}

function setMeetingList() {
    bbbCurrentMeetings = BBBUtils.getMeetingList(bbbSiteId);
    if ( bbbCurrentMeetings.length == null )
        bbbCurrentMeetings = Array();

    // watch for permissions changes, check meeting dates
    for(var i=0; i<bbbCurrentMeetings.length; i++) {
        BBBUtils.setMeetingPermissionParams(bbbCurrentMeetings[i]);
        if( bbbCurrentMeetings[i].joinable ) {
            bbbCurrentMeetings[i].joinableMode = "";
        }
        BBBUtils.setMeetingJoinableModeParams(bbbCurrentMeetings[i]);
    }
}

function refreshMeetingList() {
	// watch for permissions changes, check meeting dates
    for(var i=0; i<bbbCurrentMeetings.length; i++) {
        if( bbbCurrentMeetings[i].joinable ) {
            BBBUtils.setMeetingInfo(bbbCurrentMeetings[i]);
        }
    }
}

function refreshRecordingList(meetingId) {
	var getRecordingResponse = (meetingId == null)? BBBUtils.getSiteRecordingList(bbbSiteId): BBBUtils.getMeetingRecordingList(meetingId);

	if ( getRecordingResponse.returncode == 'SUCCESS' ){
		bbbCurrentRecordings = getRecordingResponse.recordings;
	} else {
		//Something went wrong
		bbbCurrentRecordings = new Array();
		
		if ( getRecordingResponse.messageKey != null ){
	    	BBBUtils.showMessage(getRecordingResponse.messageKey + ":" + getRecordingResponse.message, 'warning');
		} else {
	    	BBBUtils.showMessage("Unable to get response from the BigBlueButton server", 'warning');
		}
	}
}
