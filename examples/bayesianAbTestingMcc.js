import { Iterator } from './shared/iterator';
import { bayesianTest, bayesianDecision } from './shared/statistics';
import { addLabel, removeLabelFrom } from './shared/labels';
import { HtmlTable, tableStyle } from './shared/email';

// Ad conditions
const minImpressions = 'Impressions > 100';
const dateRange = 'ALL_TIME';

// Testing variables
const conversionsGreaterThan = 0;
const decisionThreshold = 0.002;
const probabilityThreshold = 0.8;

// Labels
const controlAdLabel = 'Control Ad';
const winningAdLabel = 'Winning Ad';
const losingAdLabel = 'Losing Ad';
const testingAdLabel = 'Test In Progress';

// Email
const emailRecipient = 'jfaircloth@cocg.co';
const accountLabel = 'Jonathan';

const runTest = function() {
  
  // Create the labels if they don't exist
  addLabel(controlAdLabel, '#4CAF50');
  addLabel(winningAdLabel, '#2196F3');
  addLabel(losingAdLabel, '#F44336');
  addLabel(testingAdLabel, '#FFC107');
  
  // Remove labels from ads
  removeLabelFrom(AdWordsApp.ads(), [controlAdLabel, winningAdLabel, losingAdLabel, testingAdLabel]);
  
  // Start an email table
  let table = new HtmlTable({
    title: AdWordsApp.currentAccount().getName() + ' - A/B Testing Results',
    columns: ['Campaign', 'Ad Group', 'Probability', 'Expected Loss'],
    style: tableStyle
  });
  
  // Build an array of ads in the account
  let ads = new Iterator({
    entity: AdWordsApp.ads(),
    conditions: ['Status = ENABLED','CampaignName CONTAINS_IGNORE_CASE "Search"', minImpressions],
    dateRange: dateRange,
  }).toArray({
    ad(){ return this; },
    adGroupId(){ return this.getAdGroup().getId(); },
    adGroupName(){ return this.getAdGroup().getName(); },
    campaignName(){ return this.getCampaign().getName(); },
    id(){ return this.getId(); },
    stats(){ 
      let stats = this.getStatsFor(dateRange);
      return {
        clicks: stats.getClicks(),
        conversions: stats.getConversions(),
        impressions: stats.getImpressions()
      };
    },
  });
  
  for(let i in ads){
    // Filter the array for ads in the same ad group
    let group = ads.filter(function(ad){
      return ad.adGroupId === ads[i].adGroupId;
    });
    
    // Sort the group by impressions in descending order
    group.sort(function(a, b){
      return b.stats.impressions - a.stats.impressions;
    });
    
    // Check to make sure there are at least 2 ads
    if (group.length > 1){
      
      // Apply label to control ad
      group[0].ad.applyLabel(controlAdLabel);
      
      // Skip the first ad so we can use it as a control
      for(let j = 1; j < group.length; j += 1){
        let alphaA, alphaB, betaA, betaB;
        
        // If either ad is over the conversion threshold, use conversion rate
        if(group[0].stats.conversions > conversionsGreaterThan || group[j].stats.conversions > conversionsGreaterThan){
          alphaA = group[0].stats.conversions;
          betaA = group[0].stats.clicks - alphaA;
          alphaB = group[j].stats.conversions;
          betaB = group[j].stats.clicks - alphaB;
          
        // Otherwise, use click through rate
        } else {
          alphaA = group[0].stats.clicks;
          betaA = group[0].stats.impressions - alphaA;
          alphaB = group[j].stats.clicks;
          betaB = group[j].stats.impressions - alphaB;
        }
        
        // Get the probability
        let test = bayesianTest(alphaA, betaA, alphaB, betaB);
        // Check against decision threshould
        let decision = bayesianDecision(alphaA, betaA, alphaB, betaB);
        
        // Condition: B > A and clears both thresholds
        if (decision < decisionThreshold && test > probabilityThreshold){
          group[j].ad.applyLabel(winningAdLabel);
          table.addRow([group[j].campaignName, group[j].adGroupName, (test * 100).toFixed(2) + '%', (decision * 100).toFixed(2) + '%']);
          
        // Condition: A > B and clears both thresholds
        } else if (decision < decisionThreshold && test < 1 - probabilityThreshold){
          group[j].ad.applyLabel(losingAdLabel);
          table.addRow([group[j].campaignName, group[j].adGroupName, (test * 100).toFixed(2) + '%', (decision * 100).toFixed(2) + '%']);
          
        // Condition: Either decision or probability threshold is not met
        } else {
          group[j].ad.applyLabel(testingAdLabel);
        }
        
        // Get the index of the tested ad & remove it so we don't keep testing it
        ads.splice(ads.indexOf(group[j]), 1);
      }
    }
  }
  
  table.close();
  
  return table.html;
};

function buildEmail(results){
  let emailBody = '';
  
  for (var i = 0; i < results.length; i++) {
    emailBody += results[i].getReturnValue();
  }
  
  MailApp.sendEmail({
    to: emailRecipient,
    subject: 'A/B Testing Results',
    htmlBody: emailBody,
  });
}

function main() {
  
  let accountSelector = MccApp.accounts()
      .withCondition(`LabelNames CONTAINS_IGNORE_CASE "${accountLabel}"`)
      .orderBy('Name');
  
  accountSelector.executeInParallel('runTest', 'buildEmail');
}

main();
runTest();
buildEmail();