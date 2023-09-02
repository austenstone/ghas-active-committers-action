import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  GetResponseTypeFromEndpointMethod,
} from "@octokit/types";
import moment from 'moment';

interface Input {
  token: string;
  org: string;
}

export function getInputs(): Input {
  const result = {} as Input;
  result.token = core.getInput('github-token');
  result.org = core.getInput('organization');
  if (!result.org) throw new Error('Missing required input \'organization\'')
  return result;
}

const run = async (): Promise<void> => {
  const input = getInputs();
  const octokit = github.getOctokit(input.token);
  octokit.rest.billing.getGithubAdvancedSecurityBillingOrg

  type getGithubAdvancedSecurityBillingOrgResponseType = GetResponseTypeFromEndpointMethod<
    typeof octokit.rest.billing.getGithubAdvancedSecurityBillingOrg
  >['data']['repositories'];
  const ghasBilling = (await octokit.paginate(octokit.rest.billing.getGithubAdvancedSecurityBillingOrg, {
    org: input.org,
  })) as unknown as getGithubAdvancedSecurityBillingOrgResponseType;

  let uniqueActiveComitters: {
    [key: string]: {
      'last_pushed_date': string;
      repos: string[];
    };
  } = {};

  ghasBilling.forEach((repo) => {
    repo.advanced_security_committers_breakdown.forEach((committer) => {
      if (uniqueActiveComitters[committer.user_login]) {
        uniqueActiveComitters[committer.user_login].repos.push(repo.name)
        if (uniqueActiveComitters[committer.user_login].last_pushed_date < committer.last_pushed_date) {
          uniqueActiveComitters[committer.user_login].last_pushed_date = committer.last_pushed_date
        }
      } else {
        uniqueActiveComitters[committer.user_login] = {
          last_pushed_date: committer.last_pushed_date,
          repos: [repo.name]
        }
      }
    });
  });

  uniqueActiveComitters = Object.fromEntries(Object.entries(uniqueActiveComitters).sort(([__, a], [_, b]) => a.repos.length - b.repos.length));

  await core.summary
    .addHeading('Unique Active Committers')
    .addTable([
      [{ data: 'User', header: true }, { data: 'Last Push Date', header: true }, { data: 'Repos', header: true }],
      ...Object.entries(uniqueActiveComitters)
        .map(([user, { last_pushed_date, repos }]) =>
          [
            `<a href="https://github.com/${user}" target="_blank">${user}</a>`,
            `${moment(last_pushed_date).fromNow()} (${last_pushed_date.replace(/-/g, '&#x2011;')})`,
            repos.map(repo => `<a href="https://github.com/${repo}" target="_blank">${repo}</a>`).join(', ')
          ]
        )
    ])
    .addLink('GitHub Advanced Security Billing', `https://github.com/organizations/${input.org}/settings/billing/advanced_security`)
    .write();

  core.setOutput('unique-active-committers', JSON.stringify(uniqueActiveComitters));
  core.setOutput('unique-active-committers-count', Object.entries(uniqueActiveComitters).length);
};

run();