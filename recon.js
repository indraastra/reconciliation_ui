// ========================================================================
// Copyright (c) 2008-2009, Metaweb Technologies, Inc.
// All rights reserved.
// 
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials provided
//       with the distribution.
// 
// THIS SOFTWARE IS PROVIDED BY METAWEB TECHNOLOGIES AND CONTRIBUTORS
// ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL METAWEB
// TECHNOLOGIES OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
// BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS
// OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
// TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE
// USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
// DAMAGE.
// ========================================================================


/*
**  Automatic reconciliation
*/
var manualQueue = {};
var automaticQueue = [];

function beginAutoReconciliation() {
    $(".nowReconciling").show();
    $(".notReconciling").hide();
    $("#gettingInput").remove();
    reconciliationBegun = true;
    autoReconcile();
}

function finishedAutoReconciling() {
    $(".nowReconciling").hide();
    $('.notReconciling').show();
}

function autoReconcile() {
    if (automaticQueue.length == 0) {
        finishedAutoReconciling();
        return;
    }
    updateUnreconciledCount();
    getCandidates(automaticQueue[0], autoReconcileResults, function(){automaticQueue.shift();autoReconcile();});
}

function constructReconciliationQuery(entity, typeless) {
    function constructQueryPart(value) {
        if (value.id != undefined && value.id != "" && value.id != "None")
            return {"id":value.id, "name":value["/type/object/name"]}
        if (value['/rec_ui/id'] !== undefined)
            return $.makeArray(value["/type/object/name"])[0];
        return value;
    }
    var query = {}
    var headers = entity["/rec_ui/headers"];
    for (var i = 0; i < headers.length; i++) {
        var prop = headers[i];
        if (prop.charAt(0) != "/") continue;
        var parts = prop.split(":");
        $.each($.makeArray(entity.getChainedProperty(prop)),function(j, value) {
            var slot = query;
            if (value == undefined || value == "")
                return;
            if (parts.length === 1){
                slot[prop] = slot[prop] || [];
                slot[prop][j] = constructQueryPart(value);
                return;
            }
            slot[parts[0]]    = slot[parts[0]]    || [];
            slot[parts[0]][j] = slot[parts[0]][j] || {};
            slot = slot[parts[0]][j];
            $.each(parts.slice(1,parts.length-1), function(k,part) {
                slot[part] = slot[part] || {};
                slot = slot[part];
            });
            var lastPart = parts[parts.length-1];
            slot[lastPart] = constructQueryPart(value);
        })        
    }
    if (typeless || !query['/type/object/type'])
        query['/type/object/type'] = ['/common/topic'];
    entity['/rec_ui/recon_query'] = query;
    return query;
}

function getCandidates(entity, callback, onError,typeless) {
    function handler(results) {
        entity.reconResults = results;
        callback(entity);
    }
    var defaultLimit = 4;
    var limit = defaultLimit;
    if (entity.reconResults)
        limit = entity.reconResults.length * 2;
    if (!entity.typelessRecon && typeless){
        entity.typelessRecon = true;
        limit = defaultLimit;
    }
    var query = constructReconciliationQuery(entity,typeless);
    getJSON(reconciliation_url + "query?jsonp=?", {q:JSON.stringify(query), limit:limit}, handler, onError);
}

function autoReconcileResults(entity) {
    automaticQueue.shift();
    // no results, set to None:
    if(entity.reconResults.length == 0) {
        if (!entity.typelessRecon)
            getCandidates(entity,autoReconcileResults,function(){automaticQueue.shift();autoReconcile();},true);
        
        entity.reconcileWith("None", true);
        warn("No candidates found for the object:");
        warn(entity);
        addColumnRecCases(entity);
    }        
    // match found:
    else if(entity.reconResults[0]["match"] == true) {
        entity.reconcileWith(entity.reconResults[0].id, true);
        canonicalizeFreebaseId(entity);
        entity["/rec_ui/freebase_name"] = entity.reconResults[0].name;
        addColumnRecCases(entity);
    }
    else
        addToManualQueue(entity)
    autoReconcile();
}

/*
** Manual Reconciliation
*/

function addToManualQueue(entity) {
    var wasEmpty = isObjectEmpty(manualQueue);
    var wasSingleton = getSecondValue(manualQueue) === undefined;
    manualQueue[entity["/rec_ui/id"]] = entity;
    if (wasEmpty)
        manualReconcile();
    else if (wasSingleton)
        renderReconChoices(entity)
}

function manualReconcile() {
    if ($(".manualReconChoices:visible").length === 0) {
        var val = getFirstValue(manualQueue);
        if(val != undefined) {
            displayReconChoices(val["/rec_ui/id"])
            renderReconChoices(getSecondValue(manualQueue)); //render-ahead the next one
        }
        else{
            $(".manualQueueEmpty").show();
            $(".manualReconciliation").hide();
        }
    }
}

function displayReconChoices(entityID) {
    var entity = entities[entityID];
    if (entity === undefined) return;
    $(".manualQueueEmpty").hide();
    $(".manualReconciliation").show();
    if (! $("#manualReconcile" + entityID)[0])
        renderReconChoices(entity);
    $(".manualReconChoices:visible").remove();
    $("#manualReconcile" + entityID).show();
}

function renderReconChoices(entity) {
    if (entity == undefined) return;
    var template = $("#manualReconcileTemplate").clone();
    template[0].id = "manualReconcile" + entity['/rec_ui/id'];
    var headers = entity["/rec_ui/headers"];
    var mqlProps = entity["/rec_ui/mql_props"];
    
    var currentRecord = $(".recordVals",template);
    for(var i = 0; i < headers.length; i++) {
        currentRecord.append(node("label", getPropName(headers[i]) + ":", {"for":idToClass(headers[i])}));
        currentRecord.append(node("div", {"class":"propertyGroup"}).append(displayValue(entity.getChainedProperty(headers[i]))));
    }
    
    var tableHeader = $(".reconciliationCandidates table thead", template).empty();
    var columnHeaders = ["","Image","Name","Type"].concat($.map(mqlProps,getPropName)).concat(["Score"]);
    for (var i = 0; i < columnHeaders.length; i++)
        tableHeader.append(node("th",columnHeaders[i],{"class":"bottomHeader"}));


    var tableBody = $(".reconciliationCandidates table tbody", template).empty();
    for (var i = 0; i < entity.reconResults.length; i++){
        tableBody.append(renderCandidate(entity.reconResults[i], mqlProps, entity));
        fetchMqlProps(entity.reconResults[i], entity);
    }

    function updateCandidates() {
        $('.reconciliationCandidates table tbody tr:odd', template).addClass('odd');
        $('.reconciliationCandidates table tbody tr:even', template).addClass('even');
        numCandidates = entity.reconResults.length;
    }
    updateCandidates();
    $(".find_topic", template)
        .suggest({type:entity['/type/object/type'],
                  type_strict:"should",
                  flyout:true})
        .bind("fb-select", function(e, data) { 
          entity['/rec_ui/freebase_name'] = $.makeArray(data.name);
          handleReconChoice(entity, data.id);
        });
    $(".otherSelection", template).click(function() {handleReconChoice(entity, this.name)});
    
    $(".moreButton",template).click(function() {
        $(".loadingMoreCandidates", template).fadeIn();
        getCandidates(entity, function() {
            $(".loadingMoreCandidates", template).hide();
            if (entity.reconResults.length <= numCandidates)
                return $(".moreButton",template).fadeOut();
            for (var i = numCandidates; i < entity.reconResults.length; i++){
                var candidate = renderCandidate(entity.reconResults[i], mqlProps, entity).appendTo(tableBody);
                fetchMqlProps(entity.reconResults[i], entity);
            }
            updateCandidates();
        }, function(){;});
    });
    template.insertAfter("#manualReconcileTemplate")
}

function renderCandidate(result, mqlProps, entity) {
    var url = freebase_url + "/view/" + result['id'];
    var tableRow = node("tr", {"class":idToClass(result["id"])});
    
    var button = node("button", "Select", 
       {"class":'manualSelection', 
        "name":result.id})
    tableRow.append(node("td",button));
    button.click(function(val) {entity['/rec_ui/freebase_name'] = result.name; handleReconChoice(entity, result.id)})
    
    node("td",
         node("img",{src:freebase_url + "/api/trans/image_thumb/"+result['id']+"?maxwidth=100&maxheight=100"})
    ).appendTo(tableRow);
    
    var inputName = textValue(entity);
    var reconName = textValue(result);
    var match = highlightStringMatch(inputName, reconName);

    tableRow.append(node("td", match[1]));
    var displayTypes = [];
    $.each($.makeArray(result.type), function(_,typeId) {
        //types that end in /topic are uninteresting
        if (typeId.match(/\/topic$/)) return;
        displayTypes.push(freebase.makeLink(typeId));
    })
    node("td").append(wrapForOverflow(displayTypes)).appendTo(tableRow);

    mqlProps = groupProperties(mqlProps).getPropsForRows();
    for(var j = 0; j < mqlProps.length; j++)
        tableRow.append(
            node("td", node("img",{src:"spinner.gif"}),
                 {"class":"replaceme "+idToClass(mqlProps[j])})
        );
    tableRow.append(node("td",result["score"]));
    return tableRow;
}

function fetchMqlProps(reconResult, entity) {
    var mqlProps = entity["/rec_ui/mql_props"];
    var query = {"id":reconResult["id"]};
    $.each(mqlProps, function(_, prop) {
        var slot = query;
        var parts = prop.split(":");
        $.each(parts.slice(0,parts.length-1), function(_, part) {
            slot[part] = slot[part] || [{optional:true}];
            slot = slot[part][0];
        });
        var lastPart = parts[parts.length-1];
        if (isValueProperty(lastPart))
            slot[lastPart] = [];
        else
            slot[lastPart] = [{"name":null,"id":null,"optional":true}];
    })
    var envelope = {query:query};
    function handler(results) {
        fillInMQLProps(entity, results);
        //don't show annoying loading symbols indefinitely if there's an error
        $("#manualReconcile" + entity["/rec_ui/id"] + " .replaceme").empty();
    }
    freebase.mqlRead(envelope,handler);
}

function fillInMQLProps(entity, mqlResult) {
    var context = $("#manualReconcile" + entity["/rec_ui/id"]);
    if (!mqlResult || mqlResult["code"] != "/api/status/ok" || mqlResult["result"] == null) {
        error(mqlResult);
        return;
    }

    var result = mqlResult.result;
    var row = $("tr." + idToClass(result.id),context);
    
    
    for (var i = 0; i < mqlProps.length; i++) {
        var cell = $("td." + idToClass(mqlProps[i]), row).empty();
        cell.append(displayValue(getChainedProperty(result, mqlProps[i])));
        cell.removeClass("replaceme");
    }
}

function handleReconChoice(entity,freebaseId) {
    delete manualQueue[entity["/rec_ui/id"]];
    $("#manualReconcile" + entity['/rec_ui/id']).remove();
    entity.reconcileWith(freebaseId, false);
    canonicalizeFreebaseId(entity);
    addColumnRecCases(entity);
    updateUnreconciledCount();
    manualReconcile();
}


function canonicalizeFreebaseId(entity) {
    var envelope = {query:{"myId:id":entity.id, "id":null}}
    freebase.mqlRead(envelope, function(results){
        if (results && results.result && results.result.id)
            entity.id = results.result.id
    });
}

function highlightStringMatch(string1, string2) {
    var split_re = /\s+|,|\.|_|\//;
    words1 = string1.split(split_re);
    words2 = string2.split(split_re);
    common = { }
    for (var w in words1) {
        common[words1[w].toLowerCase()] = true;
    }
    for (var w in words2) {
        var word = words2[w].toLowerCase();
        if (word in common) {
            var re = new RegExp(word, "gi");
            string1 = string1.replace(re, '<span class="matchHighlight">$&</span>');
            string2 = string2.replace(re, '<span class="matchHighlight">$&</span>');
        }
    }
    return [string1, string2];
} 
