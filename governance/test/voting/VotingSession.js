'user strict';

/**
 * @author Cyril Lapinte - <cyril.lapinte@openfiz.com>
 */

const assertRevert = require('../helpers/assertRevert');
const TokenProxy = artifacts.require('mock/TokenProxyMock.sol');
const TokenDelegate = artifacts.require('mock/TokenDelegateMock.sol');
const TokenCore = artifacts.require('mock/TokenCoreMock.sol');
const VotingSession = artifacts.require('voting/VotingSessionMock.sol');

const ALL_PRIVILEGES = web3.utils.fromAscii('AllPrivileges').padEnd(66, '0');
const NULL_ADDRESS = '0x'.padEnd(42, '0');
const NULL_BYTES32 = '0x'.padEnd(66, '0');
const NAME = 'Token';
const SYMBOL = 'TKN';
const DECIMALS = '2';
const SALT = web3.utils.sha3('Salt');
const SECRET_HASH = '0xfb567be8aa39630759001961ea1b6e2739ef38f01d6c02afc37e63420ae78452';

const DAY_IN_SEC = 24 * 3600;
const TODAY = Math.floor(new Date().getTime() / 1000);
const NEXT_START_AT = (Math.floor(new Date().getTime() / 1000 / (14 * DAY_IN_SEC)) + 1) * 14 * DAY_IN_SEC;
const Times = {
  today: TODAY,
  campaign: NEXT_START_AT - 5 * DAY_IN_SEC,
  voting: NEXT_START_AT,
  reveal: NEXT_START_AT + 2 * DAY_IN_SEC,
  grace: NEXT_START_AT + 4 * DAY_IN_SEC,
  closed: NEXT_START_AT + 14 * DAY_IN_SEC,
};

const SessionState = {
  PLANNED: '0',
  CAMPAIGN: '1',
  VOTING: '2',
  REVEAL: '3',
  GRACE: '4',
  CLOSED: '5',
};

contract('VotingSession', function (accounts) {
  let core, delegate, token, votingSession;

  const recipients = [accounts[0], accounts[1], accounts[2], accounts[3]];
  const supplies = ['100', '3000000', '2000000', '2000000'];

  const proposalName = 'Would you like to vote ?';
  const proposalHash = web3.utils.sha3('alphabet', { encoding: 'hex' });
  const proposalUrl = 'http://url.url';

  before(async function () {
    delegate = await TokenDelegate.new();
    core = await TokenCore.new('Test', [accounts[0]]);
    await core.defineTokenDelegate(1, delegate.address, [0, 1]);
  });

  beforeEach(async function () {
    token = await TokenProxy.new(core.address);
    await core.defineToken(
      token.address, 1, NAME, SYMBOL, DECIMALS);
    await core.mint(token.address, recipients, supplies);
    votingSession = await VotingSession.new(token.address);
    await core.assignProxyOperators(token.address, ALL_PRIVILEGES, [votingSession.address]);
  });

  it('should have a token', async function () {
    const foundToken = await votingSession.token();
    assert.equal(foundToken, token.address, 'token');
  });

  it('should have session rule', async function () {
    const sessionRule = await votingSession.sessionRule();
    assert.equal(sessionRule.gracePeriod.toString(), '432000', 'gracePeriod');
    assert.equal(sessionRule.campaignPeriod.toString(), '432000', 'campaignPeriod');
    assert.equal(sessionRule.votingPeriod.toString(), '172800', 'votingPeriod');
    assert.equal(sessionRule.revealPeriod.toString(), '172800', 'revealPeriod');
    assert.equal(sessionRule.maxProposals.toString(), '100', 'maxProposals');
    assert.equal(sessionRule.maxProposalsQuaestor.toString(), '255', 'maxProposalsQuaestor');
    assert.equal(sessionRule.newProposalThreshold.toString(), '1', 'newProposalThreshold');
    assert.equal(sessionRule.defaultMajority.toString(), '50', 'defaultMajority');
    assert.equal(sessionRule.defaultQuorum.toString(), '40', 'defaultQuorum');
  });

  it('should have default resolution requirements', async function () {
    const requirement = await votingSession.resolutionRequirement('0x00000000');
    assert.equal(requirement.majority.toString(), '0', 'majority');
    assert.equal(requirement.quorum.toString(), '0', 'quorum');
  });

  it('should have no voting sessions', async function () {
    const sessionsCount = await votingSession.sessionsCount();
    assert.equal(sessionsCount.toString(), '0', 'count');
  });

  it('should have no last vote for accounts[0]', async function () {
    const lastVote = await votingSession.lastVote(accounts[0]);
    assert.equal(lastVote.toString(), '0', 'last vote');
  });

  it('should have no secret hash for accounts[0]', async function () {
    const secretHash = await votingSession.secretHash(accounts[0]);
    assert.equal(secretHash, NULL_BYTES32, 'secret hash');
  });

  it('should have no proposals', async function () {
    const proposalsCount = await votingSession.proposalsCount();
    assert.equal(proposalsCount, '0', 'count');
  });

  it('should have no proposals 0', async function () {
    await assertRevert(votingSession.proposal(0), 'BVXX');
  });

  it('should have accounts[0] as the default quaestor', async function () {
    const isQuaestor = await votingSession.isQuaestor(accounts[0]);
    assert.ok(isQuaestor, 'quaestor');
  });

  it('should not have accounts[1] as quaestor', async function () {
    const isQuaestor = await votingSession.isQuaestor(accounts[1]);
    assert.ok(!isQuaestor, 'quaestor');
  });

  it('should have session status CLOSED for all dates', async function () {
    const statuses = await Promise.all(Object.keys(Times).map((key, i) =>
      votingSession.sessionStateAt(0, Times[key]).then((status_) => status_.toString())));
    assert.deepEqual(statuses, [
      SessionState.CLOSED,
      SessionState.CLOSED,
      SessionState.CLOSED,
      SessionState.CLOSED,
      SessionState.CLOSED,
      SessionState.CLOSED,
    ], 'statuses');
  });

  it('should build hash', async function () {
    const message = votingSession.contract.methods.revealVoteSecret(
      [false], SALT).encodeABI();
    const hash = await votingSession.buildHash(message);
    assert.equal(hash, SECRET_HASH, 'secret');
  });

  it('should let quaestor add a new proposal', async function () {
    const tx = await votingSession.defineProposal(
      proposalName,
      proposalUrl,
      proposalHash,
      NULL_ADDRESS,
      '0x');
    assert.ok(tx.receipt.status, 'Status');
    assert.equal(tx.logs.length, 2);
    assert.equal(tx.logs[0].event, 'SessionScheduled', 'event');
    assert.equal(tx.logs[0].args.sessionId.toString(), '0', 'session id');
    assert.equal(tx.logs[0].args.startAt.toString(), NEXT_START_AT, 'startAt');
    assert.equal(tx.logs[1].event, 'ProposalDefined', 'event');
    assert.equal(tx.logs[1].args.proposalId.toString(), '0', 'proposalId');
  });

  describe('with a new proposal', function () {
    let secretHash;

    beforeEach(async function () {
      const hash = votingSession.contract.methods.revealVoteSecret(
        [false], SALT).encodeABI();
      secretHash = await votingSession.buildHash(hash);
      await votingSession.defineProposal(
        proposalName,
        proposalUrl,
        proposalHash,
        NULL_ADDRESS,
        '0x');
    });

    it('should have a session count', async function () {
      const sessionsCount = await votingSession.sessionsCount();
      assert.equal(sessionsCount.toString(), '1', 'count');
    });

    it('should have a proposal count', async function () {
      const proposalsCount = await votingSession.proposalsCount();
      assert.equal(proposalsCount.toString(), '1', 'count');
    });

    it('should have a session', async function () {
      const session = await votingSession.session(0);
      assert.equal(session.startAt, NEXT_START_AT, 'startAt');
      assert.equal(session.proposalsCount, 1, 'proposalsCount');
      assert.equal(session.participation, 0, 'participation');
    });

    it('should have a proposal', async function () {
      const proposal = await votingSession.proposal(0);
      assert.equal(proposal.sessionId.toString(), '0', 'sessionId');
      assert.equal(proposal.name, proposalName, 'name');
      assert.equal(proposal.url, proposalUrl, 'url');
      assert.equal(proposal.proposalHash, proposalHash, 'hash');
      assert.equal(proposal.proposedBy, accounts[0], 'proposedBy');
      assert.equal(proposal.resolutionAction, null, 'action');
      assert.equal(proposal.resolutionTarget, NULL_ADDRESS, 'target');
      assert.equal(proposal.weight.toString(), '100', 'weight');
      assert.equal(proposal.approvals.toString(), '0', 'approvals');
      assert.ok(!proposal.resolutionExecuted, 'executed');
      assert.ok(!proposal.cancelled, 'cancelled');
    });

    it('should have session all status for the different dates', async function () {
      const statuses = await Promise.all(Object.keys(Times).map((key, i) =>
        votingSession.sessionStateAt(0, Times[key]).then((status_) => status_.toString())));
      assert.deepEqual(statuses, [
        SessionState.PLANNED,
        SessionState.CAMPAIGN,
        SessionState.VOTING,
        SessionState.REVEAL,
        SessionState.GRACE,
        SessionState.CLOSED,
      ], 'statuses');
    });

    describe('during campaign', function () {
      beforeEach(async function () {
        await votingSession.nextSessionStepTest();
      });

      it('should not be possible to add more proposal', async function () {
        await assertRevert(votingSession.defineProposal(
          proposalName,
          proposalUrl,
          proposalHash,
          NULL_ADDRESS,
          '0x'), 'VS09');
      });
    });

    describe('during voting', function () {
      beforeEach(async function () {
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
      });

      it('should have the token locked', async function () {
        const tokenData = await core.token(token.address);
        assert.equal(tokenData.lock[0].toString(), Times.voting, 'lock start');
        assert.equal(tokenData.lock[1].toString(), Times.grace, 'lock end');
      });

      it('should be possible to submit a vote', async function () {
        const tx = await votingSession.submitVote([true]);
        assert.ok(tx.receipt.status, 'Status');
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, 'Vote', 'event');
        assert.equal(tx.logs[0].args.sessionId.toString(), '0', 'session id');
        assert.equal(tx.logs[0].args.voter, accounts[0], 'voter');
        assert.equal(tx.logs[0].args.weight, '100', 'weight');
      });

      it('should be possible to submit a vote secretly', async function () {
        const tx = await votingSession.submitVoteSecret(secretHash);
        assert.ok(tx.receipt.status, 'Status');
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, 'VoteSecret', 'event');
        assert.equal(tx.logs[0].args.sessionId.toString(), '0', 'session id');
        assert.equal(tx.logs[0].args.voter, accounts[0], 'voter');
      });

      describe('after submitted a vote', function () {
        beforeEach(async function () {
          await votingSession.submitVote([true]);
        });

        it('should not be possible to vote twice', async function () {
          await assertRevert(votingSession.submitVote([true]), 'VS11');
        });

        it('should not be possible to vote secretly once voted', async function () {
          await assertRevert(votingSession.submitVoteSecret(secretHash), 'VS11');
        });

        it('should not be possible to reveal vote secret once voted', async function () {
          await assertRevert(votingSession.revealVoteSecret([false], SALT), 'VS14');
        });
      });

      describe('after submitted a secret vote', function () {
        beforeEach(async function () {
          await votingSession.submitVoteSecret(secretHash);
        });

        it('should be possible to vote', async function () {
          const tx = await votingSession.submitVote([true]);
          assert.ok(tx.receipt.status, 'Status');
          assert.equal(tx.logs.length, 1);
          assert.equal(tx.logs[0].event, 'Vote', 'event');
          assert.equal(tx.logs[0].args.sessionId.toString(), '0', 'session id');
          assert.equal(tx.logs[0].args.voter, accounts[0], 'voter');
          assert.equal(tx.logs[0].args.weight, '100', 'weight');
        });

        it('should be possible vote secretly twice', async function () {
          const tx = await votingSession.submitVoteSecret(secretHash);
          assert.ok(tx.receipt.status, 'Status');
          assert.equal(tx.logs.length, 1);
          assert.equal(tx.logs[0].event, 'VoteSecret', 'event');
          assert.equal(tx.logs[0].args.sessionId.toString(), '0', 'session id');
          assert.equal(tx.logs[0].args.voter, accounts[0], 'voter');
        });

        it('should not be possible to reveal vote secret once voted', async function () {
          await assertRevert(votingSession.revealVoteSecret([false], SALT), 'VS14');
        });
      });
    });

    describe('during reveal', function () {
      beforeEach(async function () {
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
        await votingSession.submitVoteSecret(secretHash);
        await votingSession.nextSessionStepTest();
      });

      it('should not be possible to vote', async function () {
        await assertRevert(votingSession.submitVote([true]), 'VS13');
      });

      it('should not be possible vote secretly twice', async function () {
        await assertRevert(votingSession.submitVoteSecret(secretHash), 'VS13');
      });

      it('should be possible to reveal vote secret with the correct salt', async function () {
        const tx = await votingSession.revealVoteSecret([false], SALT);
        assert.ok(tx.receipt.status, 'Status');
        assert.equal(tx.logs.length, 2);
        assert.equal(tx.logs[0].event, 'VoteRevealed', 'event');
        assert.equal(tx.logs[0].args.sessionId.toString(), '0', 'session id');
        assert.equal(tx.logs[0].args.voter, accounts[0], 'voter');
        assert.equal(tx.logs[1].event, 'Vote', 'event');
        assert.equal(tx.logs[1].args.sessionId.toString(), '0', 'session id');
        assert.equal(tx.logs[1].args.voter, accounts[0], 'voter');
        assert.equal(tx.logs[1].args.weight, '100', 'weight');
      });

      it('should not be possible to reveal vote secret with an incorrect salt', async function () {
        await assertRevert(votingSession.revealVoteSecret([false], web3.utils.sha3('WrongSalt')), 'VS18');
      });
    });
  });

  /* describe('with an approved proposal to change the session rules', function () {
    beforeEach(async function () {
      const request = votingSession.contract.methods.updateSessionRule(
        '60', '60', '60', '60', '1', '2', '3000000').encodeABI();
      await votingSession.defineProposal(
        'Changing the rules',
        proposalUrl,
        proposalHash,
        session.address);
    });
  });

  describe('with an approved proposal to change the resolution requirements', function () {
    beforeEach(async function () {
      const request = votingSession.contract.methods.updateResolutionRequirements(
        [], [], []).encodeABI();
      await votingSession.defineProposal(
        'Changing the requirements',
        proposalUrl,
        proposalHash,
        session.address);
    });
  }); */

  describe('with 3 proposals: blank, mint and burn', function () {
    let request1, request2;

    const MINT_MORE_TOKENS = 'Mint more tokens!';

    beforeEach(async function () {
      await votingSession.defineProposal(
        proposalName,
        proposalUrl,
        proposalHash,
        NULL_ADDRESS,
        '0x');

      request1 = core.contract.methods.mint(token.address, [accounts[4]], ['13999900']).encodeABI();
      await votingSession.defineProposal(
        MINT_MORE_TOKENS,
        proposalUrl,
        proposalHash,
        core.address,
        request1);

      request2 = core.contract.methods.seize(token.address, accounts[1], '1000000').encodeABI();
      await votingSession.defineProposal(
        'seize dat bastard!',
        proposalUrl,
        proposalHash,
        core.address,
        request2);
    });

    it('should have 3 proposals', async function () {
      const count = await votingSession.proposalsCount();
      assert.equal(count.toString(), '3', 'count');
    });

    describe('during voting', function () {
      beforeEach(async function () {
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
      });

      it('should be possible to vote', async function () {
        await votingSession.submitVote([true, false, false]);
      });

      it('should have the token locked', async function () {
        const tokenData = await core.token(token.address);
        assert.equal(tokenData.lock[0].toString(), Times.voting, 'lock start');
        assert.equal(tokenData.lock[1].toString(), Times.grace, 'lock end');
      });
    });

    describe('without enought votes for the quorum', function () {
      beforeEach(async function () {
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
        await votingSession.submitVote([true, true, true]);
        await votingSession.submitVote([true, true, false], { from: accounts[3] });
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
      });

      it('should have a session', async function () {
        const session = await votingSession.session(0);
        assert.equal(session.proposalsCount.toString(), '3', 'proposalsCount');
        assert.equal(session.participation.toString(), '2000100', 'participation');
      });

      it('should have approvals for blank proposal', async function () {
        const proposal = await votingSession.proposal(0);
        assert.equal(proposal.approvals.toString(), '2000100', 'approvals');
      });

      it('should have approvals for mint proposal', async function () {
        const proposal = await votingSession.proposal(1);
        assert.equal(proposal.approvals.toString(), '2000100', 'approvals');
      });

      it('should have approvals for seize proposal', async function () {
        const proposal = await votingSession.proposal(2);
        assert.equal(proposal.approvals.toString(), '100', 'approvals');
      });

      it('should have blank proposal rejected', async function () {
        const approved = await votingSession.isApproved(0);
        assert.ok(!approved, 'rejected');
      });

      it('should have mint proposal rejected', async function () {
        const approved = await votingSession.isApproved(1);
        assert.ok(!approved, 'rejected');
      });

      it('should have seize proposal rejected', async function () {
        const approved = await votingSession.isApproved(2);
        assert.ok(!approved, 'rejected');
      });
    });

    describe('after sucessfull votes, during grace period', function () {
      beforeEach(async function () {
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
        await votingSession.submitVote([false, false, false]);
        await votingSession.submitVote([true, true, false], { from: accounts[1] });
        await votingSession.submitVote([true, false, true], { from: accounts[2] });
        await votingSession.submitVote([true, true, false], { from: accounts[3] });
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
      });

      it('should have a session', async function () {
        const session = await votingSession.session(0);
        assert.equal(session.proposalsCount.toString(), '3', 'proposalsCount');
        assert.equal(session.participation.toString(), '7000100', 'participation');
      });

      it('should have approvals for blank proposal', async function () {
        const proposal = await votingSession.proposal(0);
        assert.equal(proposal.approvals.toString(), '7000000', 'approvals');
      });

      it('should have approvals for mint proposal', async function () {
        const proposal = await votingSession.proposal(1);
        assert.equal(proposal.approvals.toString(), '5000000', 'approvals');
      });

      it('should have approvals for seize proposal', async function () {
        const proposal = await votingSession.proposal(2);
        assert.equal(proposal.approvals.toString(), '2000000', 'approvals');
      });

      it('should have blank proposal approved', async function () {
        const approved = await votingSession.isApproved(0);
        assert.ok(approved, 'approved');
      });

      it('should have mint proposal approved', async function () {
        const approved = await votingSession.isApproved(1);
        assert.ok(approved, 'approved');
      });

      it('should have seize proposal rejected', async function () {
        const approved = await votingSession.isApproved(2);
        assert.ok(!approved, 'rejected');
      });

      it('should be possible to execute blank proposal', async function () {
        const tx = await votingSession.executeResolution(0);
        assert.ok(tx.receipt.status, 'Status');
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, 'ResolutionExecuted', 'event');
        assert.equal(tx.logs[0].args.proposalId.toString(), '0', 'proposal id');
      });

      it('should be possible to execute mint proposal', async function () {
        const tx = await votingSession.executeResolution(1);
        assert.ok(tx.receipt.status, 'Status');
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, 'ResolutionExecuted', 'event');
        assert.equal(tx.logs[0].args.proposalId.toString(), '1', 'proposal id');

        const totalSupply = await token.totalSupply();
        assert.equal(totalSupply.toString(), '21000000', 'totalSupply');
        const balance4 = await token.balanceOf(accounts[4]);
        assert.equal(balance4.toString(), '13999900', 'balance4');
      });

      it('should not be possible to execute seize proposal', async function () {
        await assertRevert(votingSession.executeResolution(2), 'VS19');
      });

      describe('after minting', function () {
        beforeEach(async function () {
          await votingSession.executeResolution(1);
        });

        it('should have proposal executed', async function () {
          const proposal = await votingSession.proposal(1);
          assert.equal(proposal.sessionId.toString(), '0', 'sessionId');
          assert.equal(proposal.name, MINT_MORE_TOKENS, 'name');
          assert.equal(proposal.url, proposalUrl, 'url');
          assert.equal(proposal.proposalHash, proposalHash, 'hash');
          assert.equal(proposal.proposedBy, accounts[0], 'proposedBy');
          assert.equal(proposal.resolutionAction, request1, 'action');
          assert.equal(proposal.resolutionTarget, core.address, 'target');
          assert.equal(proposal.weight.toString(), '100', 'weight');
          assert.equal(proposal.approvals.toString(), '5000000', 'approvals');
          assert.ok(proposal.resolutionExecuted, 'executed');
          assert.ok(!proposal.cancelled, 'cancelled');
        });

        it('should not be possible to mint twice', async function () {
          await assertRevert(votingSession.executeResolution(1), 'VS16');
        });
      });
    });

    describe('after grace period', function () {
      beforeEach(async function () {
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
        await votingSession.nextSessionStepTest();
      });

      it('should not be possible to execute mint proposal anymore', async function () {
        await assertRevert(votingSession.executeResolution(1), 'VS15');
      });
    });
  });
});
