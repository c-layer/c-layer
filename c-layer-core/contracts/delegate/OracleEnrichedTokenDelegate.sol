pragma solidity >=0.5.0 <0.6.0;

import "./BaseTokenDelegate.sol";
import "../util/convert/BytesConvert.sol";


/**
 * @title OracleEnrichedTokenDelegate
 * @dev OracleEnrichedTokenDelegate contract
 * @dev Enriched the transfer with oracle's informations
 * @dev needed for the delegate processing
 *
 * @author Cyril Lapinte - <cyril.lapinte@openfiz.com>
 *
 * Error messages
 */
contract OracleEnrichedTokenDelegate is BaseTokenDelegate {
  using BytesConvert for bytes;

  /**
   * @dev fetchCallerUser
   */
  function fetchCallerUser(TransferData memory _transferData,
    uint256[] memory _userKeys) internal view {
    if (!_transferData.callerFetched) {
      (_transferData.callerId, _transferData.callerKeys) =
        userRegistry_.validUser(_transferData.caller, _userKeys);
      _transferData.callerFetched = true;
    }
  }

  /**
   * @dev fetchSenderUser
   */
  function fetchSenderUser(TransferData memory _transferData,
    uint256[] memory _userKeys) internal view
  {
    if (!_transferData.senderFetched) {
      (_transferData.senderId, _transferData.senderKeys) =
        userRegistry_.validUser(_transferData.sender, _userKeys);
      _transferData.senderFetched = true;
    }
  }


  /**
   * @dev fetchReceiverUser
   */
  function fetchReceiverUser(TransferData memory _transferData,
    uint256[] memory _userKeys) internal view
  {
    if (!_transferData.receiverFetched) {
      (_transferData.receiverId, _transferData.receiverKeys) =
        userRegistry_.validUser(_transferData.receiver, _userKeys);
      _transferData.receiverFetched = true;
    }
  }

  /**
   * @dev fetchConvertedValue
   * @dev warning: a converted value of 0 should be considered invalid
   * @dev it is left to the code calling this function to handle this case
   */
  function fetchConvertedValue(TransferData memory _transferData,
    IRatesProvider _ratesProvider,
    bytes32 _currency) internal view
  {
    uint256 value = _transferData.value;
    if (_transferData.convertedValue == 0 && value != 0) {
      TokenData memory token = tokens[_transferData.token];
      bytes32 currencyFrom = bytes(token.symbol).toBytes32();

      _transferData.convertedValue =
        _ratesProvider.convert(value, currencyFrom, _currency);
    }
  }
}
