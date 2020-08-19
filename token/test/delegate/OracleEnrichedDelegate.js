'user strict';

/**
 * @author Cyril Lapinte - <cyril.lapinte@openfiz.com>
 */

const assertThrow = require('../helpers/assertThrow');
const { assertTransferLog } = require('../helpers/assertLog');
const OracleEnrichedDelegateMock = artifacts.require('OracleEnrichedDelegateMock.sol');
const UserRegistry = artifacts.require('UserRegistry.sol');
const RatesProvider = artifacts.require('RatesProvider.sol');

const TOKEN_ADDRESS = '0x' + '123456789'.padStart(40, '0');
const TOKEN_BYTES = web3.utils.toHex(TOKEN_ADDRESS).padEnd(66, '0');
const CHF = 'CHF';
const CHF_BYTES = web3.utils.toHex(CHF).padEnd(66, '0');
const CHF_ADDRESS = web3.utils.toHex(CHF).padEnd(42, '0');
const NULL_ADDRESS = '0x'.padEnd(42, '0');
const EMPTY_ADDRESS = '0x'.padEnd(42, '0');
const NEXT_YEAR = Math.floor(new Date().getTime() / 1000) + (24 * 3600 * 365);

const FETCH_SENDER_ID_ESTIMATE = 33400;
const FETCH_SENDER_ESTIMATE = 102865;
const FETCH_RECEIVER_ID_ESTIMATE = 33357;
const FETCH_RECEIVER_ESTIMATE = 102891;
const FETCH_CONVERT_RATE = 39952;

contract('OracleEnrichedDelegate', function (accounts) {
  let delegate, userRegistry, ratesProvider;

  describe('With no oracles', function () {
    beforeEach(async function () {
      delegate = await OracleEnrichedDelegateMock.new();
    });

    it('should fail to fetch sender user id', async function () {
      await assertThrow(delegate.testFetchSenderUserId(accounts[0]));
    });

    it('should fail to fetch sender user', async function () {
      await assertThrow(delegate.testFetchSenderUser(accounts[0], [1, 2]));
    });

    it('should fail to fetch receiver user id', async function () {
      await assertThrow(delegate.testFetchReceiverUserId(accounts[0]));
    });

    it('should fail to fetch receiver user', async function () {
      await assertThrow(delegate.testFetchReceiverUser(accounts[0], [1, 2]));
    });

    it('should fetch converted value for 0', async function () {
      const tx = await delegate.testFetchConvertedValue(
        0, NULL_ADDRESS, TOKEN_ADDRESS, CHF_ADDRESS);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: TOKEN_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: NULL_ADDRESS,
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '0',
        convertedValue: '0',
      }, 'converted value is 0');
    });

    it('should fetch converted value for 100 same currency', async function () {
      const tx = await delegate.testFetchConvertedValue(
        100, NULL_ADDRESS, TOKEN_ADDRESS, TOKEN_ADDRESS);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: TOKEN_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: NULL_ADDRESS,
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '100',
        convertedValue: '100',
      }, 'converted value is 0');
    });

    it('should fail to fetch converted value for 100 in a different currency', async function () {
      await assertThrow(delegate.testFetchConvertedValue(
        100, NULL_ADDRESS, TOKEN_ADDRESS, CHF_ADDRESS));
    });
  });

  describe('With oracle mock defined', function () {
    beforeEach(async function () {
      delegate = await OracleEnrichedDelegateMock.new();
      await delegate.defineUsers(
        [accounts[0], accounts[1], accounts[2]], [0, 1000, 2500], [0, 2000, 500]);

      ratesProvider = delegate;
      userRegistry = delegate;
    });

    it('should provides rates', async function () {
      const rate = await ratesProvider.convert(100, EMPTY_ADDRESS, CHF_ADDRESS);
      assert.equal(rate.toString(), '150', 'mocked rate');
    });

    it('should provides users', async function () {
      const user = await userRegistry.validUser(accounts[1], [1, 2]);
      assert.equal(user[0].toString(), '2', 'user id');
      assert.deepEqual(user[1].map((x) => x.toString()), ['1000', '2000']);
    });

    it('should fetch sender user id', async function () {
      const tx = await delegate.testFetchSenderUserId(accounts[1]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: accounts[1],
        receiver: NULL_ADDRESS,
        senderId: '2',
        senderKeys: [],
        senderFetched: true,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '0',
        convertedValue: '0',
      }, 'sender user id is fetched');
    });

    it('should fetch sender user', async function () {
      const tx = await delegate.testFetchSenderUser(accounts[1], [1]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: accounts[1],
        receiver: NULL_ADDRESS,
        senderId: '2',
        senderKeys: ['1000'],
        senderFetched: true,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '0',
        convertedValue: '0',
      }, 'sender user is fetched');
    });

    it('should fetch receiver user id', async function () {
      const tx = await delegate.testFetchReceiverUserId(accounts[2]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: accounts[2],
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '3',
        receiverKeys: [],
        receiverFetched: true,
        value: '0',
        convertedValue: '0',
      }, 'receiver user id is fetched');
    });

    it('should fetch receiver user', async function () {
      const tx = await delegate.testFetchReceiverUser(accounts[2], [1, 2]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: accounts[2],
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '3',
        receiverKeys: ['2500', '500'],
        receiverFetched: true,
        value: '0',
        convertedValue: '0',
      }, 'receiver user is fetched');
    });

    it('should fetch converted value', async function () {
      const tx = await delegate.testFetchConvertedValue(
        100, ratesProvider.address, TOKEN_ADDRESS, CHF_ADDRESS);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: TOKEN_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: NULL_ADDRESS,
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '100',
        convertedValue: '150',
      }, 'value is converted');
    });
  });

  describe('With oracles defined', function () {
    before(async function () {
      ratesProvider = await RatesProvider.new('Test');
      await ratesProvider.defineCurrencies([CHF_BYTES, TOKEN_BYTES], ['0', '0'], '100');
      await ratesProvider.defineRates(['150']);
      userRegistry = await UserRegistry.new('Test', CHF_ADDRESS, accounts, NEXT_YEAR);
      await userRegistry.updateUserAllExtended(2, ['0', '1000', '2000']);
      await userRegistry.updateUserAllExtended(3, ['0', '2500', '500']);
    });

    beforeEach(async function () {
      delegate = await OracleEnrichedDelegateMock.new();
      await delegate.defineOracle(userRegistry.address, ratesProvider.address, CHF_ADDRESS);
    });

    it('should fetch sender user id', async function () {
      const tx = await delegate.testFetchSenderUserId(accounts[1]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: accounts[1],
        receiver: NULL_ADDRESS,
        senderId: '2',
        senderKeys: [],
        senderFetched: true,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '0',
        convertedValue: '0',
      }, 'sender user id is fetched');
    });

    it('should fetch sender user', async function () {
      const tx = await delegate.testFetchSenderUser(accounts[1], [1]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: accounts[1],
        receiver: NULL_ADDRESS,
        senderId: '2',
        senderKeys: ['1000'],
        senderFetched: true,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '0',
        convertedValue: '0',
      }, 'sender user is fetched');
    });

    it('should fetch receiver user id', async function () {
      const tx = await delegate.testFetchReceiverUserId(accounts[2]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: accounts[2],
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '3',
        receiverKeys: [],
        receiverFetched: true,
        value: '0',
        convertedValue: '0',
      }, 'receiver user id is fetched');
    });

    it('should fetch receiver user', async function () {
      const tx = await delegate.testFetchReceiverUser(accounts[2], [1, 2]);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: NULL_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: accounts[2],
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '3',
        receiverKeys: ['2500', '500'],
        receiverFetched: true,
        value: '0',
        convertedValue: '0',
      }, 'receiver user is fetched');
    });

    it('should fetch converted value', async function () {
      const tx = await delegate.testFetchConvertedValue(
        100, ratesProvider.address, TOKEN_ADDRESS, CHF_ADDRESS);
      assert.ok(tx.receipt.status, 'Status');
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, 'LogTransferData', 'event');
      assertTransferLog(tx.logs[0].args, {
        token: TOKEN_ADDRESS,
        caller: NULL_ADDRESS,
        sender: NULL_ADDRESS,
        receiver: NULL_ADDRESS,
        senderId: '0',
        senderKeys: [],
        senderFetched: false,
        receiverId: '0',
        receiverKeys: [],
        receiverFetched: false,
        value: '100',
        convertedValue: '150',
      }, 'value is converted');
    });

    it('should estimate gas to fetch sender user id [ @skip-on-coverage ]', async function () {
      const estimate = await delegate.testFetchSenderUserId.estimateGas(accounts[2]);
      assert.equal(estimate, FETCH_SENDER_ID_ESTIMATE, 'fetch sender user id estimate');
    });

    it('should estimate gas to fetch sender user [ @skip-on-coverage ]', async function () {
      const estimate = await delegate.testFetchSenderUser.estimateGas(accounts[2], [1, 2]);
      assert.equal(estimate, FETCH_SENDER_ESTIMATE, 'fetch sender user estimate');
    });

    it('should estimate gas to fetch receiver user id [ @skip-on-coverage ]', async function () {
      const estimate = await delegate.testFetchReceiverUserId.estimateGas(accounts[2]);
      assert.equal(estimate, FETCH_RECEIVER_ID_ESTIMATE, 'fetch receiver user id estimate');
    });

    it('should estimate gas to fetch receiver user [ @skip-on-coverage ]', async function () {
      const estimate = await delegate.testFetchReceiverUser.estimateGas(accounts[2], [1, 2]);
      assert.equal(estimate, FETCH_RECEIVER_ESTIMATE, 'fetch receiver user estimate');
    });

    it('should estimate gas to fetch converted value [ @skip-on-coverage ]', async function () {
      const estimate = await delegate.testFetchConvertedValue.estimateGas(
        100, ratesProvider.address, TOKEN_ADDRESS, CHF_ADDRESS);
      assert.equal(estimate, FETCH_CONVERT_RATE, 'fetch convert estimate');
    });
  });
});
