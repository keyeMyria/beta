import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import Neon from "@cityofzion/neon-js";
import { doSendAsset, verifyAddress } from "neon-js";
import { api, wallet, sc, rpc, u } from "@cityofzion/neon-js";
import Modal from "react-bootstrap-modal";
import axios from "axios";
import SplitPane from "react-split-pane";
import ReactTooltip from "react-tooltip";
import { log } from "../../util/Logs";
import thorLogo from "../../img/thor.png";
import Assets from "./../Assets";
import { clipboard } from "electron";
import { togglePane } from "../../modules/dashboard";
import {
  sendEvent,
  clearTransactionEvent,
  toggleAsset
} from "../../modules/transactions";
import { ASSETS, TOKENS, TOKENS_TEST } from "../../core/constants";
import { flatMap, keyBy, get, omit, pick } from "lodash";

let sendAddress, sendAmount, confirmButton, scriptHash, thor_usd, gas_usd;

const apiURL = val => {
  return "https://min-api.cryptocompare.com/data/price?fsym=THOR&tsyms=USD";
};

const apiURLForGas = val => {
  return "https://min-api.cryptocompare.com/data/price?fsym=GAS&tsyms=USD";
};

const isToken = symbol => {
  ![ASSETS.NEO, ASSETS.GAS].includes(symbol);
};
// form validators for input fields
const validateForm = (dispatch, neo_balance, gas_balance, asset) => {
  alert(asset);
  // check for valid address
  try {
    if (
      verifyAddress(sendAddress.value) !== true ||
      sendAddress.value.charAt(0) !== "A"
    ) {
      dispatch(sendEvent(false, "The address you entered was not valid."));
      setTimeout(() => dispatch(clearTransactionEvent()), 1000);
      return false;
    }
  } catch (e) {
    dispatch(sendEvent(false, "The address you entered was not valid."));
    setTimeout(() => dispatch(clearTransactionEvent()), 1000);
    return false;
  }
  // check for fractional neo
  if (
    asset === "Neo" &&
    parseFloat(sendAmount.value) !== parseInt(sendAmount.value)
  ) {
    dispatch(sendEvent(false, "You cannot send fractional amounts of Neo."));
    setTimeout(() => dispatch(clearTransactionEvent()), 1000);
    return false;
  } else if (asset === "Neo" && parseInt(sendAmount.value) > neo_balance) {
    // check for value greater than account balance
    dispatch(sendEvent(false, "You do not have enough NEO to send."));
    setTimeout(() => dispatch(clearTransactionEvent()), 1000);
    return false;
  } else if (asset === "Gas" && parseFloat(sendAmount.value) > gas_balance) {
    dispatch(sendEvent(false, "You do not have enough GAS to send."));
    setTimeout(() => dispatch(clearTransactionEvent()), 1000);
    return false;
  } else if (parseFloat(sendAmount.value) < 0) {
    // check for negative asset
    dispatch(sendEvent(false, "You cannot send negative amounts of an asset."));
    setTimeout(() => dispatch(clearTransactionEvent()), 1000);
    return false;
  }
  return true;
};

// open confirm pane and validate fields
const openAndValidate = (dispatch, neo_balance, gas_balance, asset) => {
  if (validateForm(dispatch, neo_balance, gas_balance, asset) === true) {
    dispatch(togglePane("confirmPane"));
  }
};

const extractAssets = sendEntries => {
  //: Array<SendEntryType>
  return sendEntries.filter(({ symbol }) => !isToken(symbol));
};

const buildIntents = sendEntries => {
  //: Array<SendEntryType>
  const assetEntries = extractAssets(sendEntries);
  // $FlowFixMe
  return flatMap(assetEntries, ({ address, amount, symbol }) =>
    api.makeIntent(
      {
        [symbol]: Number(amount)
      },
      address
    )
  );
};

const buildIntentsForInvocation = (
  sendEntries, //: Array<SendEntryType>,
  fromAddress
) => {
  //const intents = buildIntents(sendEntries)
  const intents = [];
  console.log("intents = " + JSON.stringify(intents));

  if (intents.length > 0) {
    return intents;
  } else {
    return buildIntents([
      {
        address: fromAddress,
        amount: "0.00000001",
        symbol: ASSETS.GAS
      }
    ]);
  }
};

const buildTransferScript = (
  net,
  sendEntries, //: Array<SendEntryType>,
  fromAddress,
  tokensBalanceMap //: {
  //     [key: string]: TokenBalanceType
  // }
) => {
  // const tokenEntries = extractTokens(sendEntries);
  //console.log("tokenEntries = " + tokenEntries);
  const fromAcct = new wallet.Account(fromAddress);
  console.log("fromAcct = " + JSON.stringify(fromAcct));
  const scriptBuilder = new sc.ScriptBuilder();
  console.log("scriptBuilder = " + scriptBuilder);

  sendEntries.forEach(({ address, amount, symbol }) => {
    const toAcct = new wallet.Account(address);
    console.log("toAcct = " + JSON.stringify(toAcct));
    const scriptHash = tokensBalanceMap[symbol].scriptHash;
    console.log("Script Hash = " + scriptHash);
    const decimals = tokensBalanceMap[symbol].decimals;
    console.log("decimals = " + decimals);
    const args = [
      u.reverseHex(fromAcct.scriptHash),
      u.reverseHex(toAcct.scriptHash),
      sc.ContractParam.byteArray(Number(amount), "fixed8", decimals)
    ];

    scriptBuilder.emitAppCall(scriptHash, "transfer", args);
  });

  return scriptBuilder.str;
};

const makeRequest = (sendEntries, config) => {
  //: Array<SendEntryType> ,: Object
  console.log("config = " + JSON.stringify(config));
  const script = buildTransferScript(
    config.net,
    sendEntries,
    config.address,
    config.tokensBalanceMap
  );

  console.log("buildTransferScript = " + script);
  return api.doInvoke({
    ...config,
    intents: buildIntentsForInvocation(sendEntries, config.address),
    script,
    gas: 0
  });
};

// perform send transaction for THOR
const sendThorTransaction = async (dispatch, net, selfAddress, wif) => {
  const endpoint = await api.neonDB.getRPCEndpoint(net);
  console.log("endpoint = " + endpoint);
  let script;
  if (net == "MainNet") {
    script = TOKENS.THOR;
  } else {
    script = TOKENS_TEST.THOR;
  }
  const token_response = await api.nep5.getToken(endpoint, script, selfAddress);
  const thor_balance = token_response.balance;
  console.log("token_response = " + JSON.stringify(token_response));
  const tokenBalances = {
    name: token_response.name,
    symbol: token_response.symbol,
    decimals: token_response.decimals,
    totalSupply: token_response.totalSupply,
    balance: token_response.balance,
    scriptHash: script
  };
  const tokensBalanceMap = {
    THOR: tokenBalances
  }; //keyBy(tokenBalances, 'symbol');
  console.log("tokensBalanceMap = " + JSON.stringify(tokensBalanceMap));
  let privateKey = new wallet.Account(wif).privateKey;
  let publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
  console.log("public Key = " + publicKey);
  //sendEntries ,// Array<SendEntryType>,
  let sendEntries = new Array();
  var sendEntry = {
    amount: sendAmount.value.toString(),
    address: sendAddress.value.toString(),
    symbol: "THOR"
  };
  sendEntries.push(sendEntry);
  console.log("sendEntries = " + JSON.stringify(sendEntries));
  if (thor_balance <= sendAmount.value) {
    dispatch(sendEvent(false, "You are trying to send more THOR than you have available."));
		setTimeout(() => dispatch(clearTransactionEvent()), 2000);
		return true;
  } else {
    dispatch(sendEvent(true, "Sending THOR...\n"));
    try {
      const { response } = await makeRequest(sendEntries, {
        net,
        tokensBalanceMap,
        address: selfAddress,
        undefined,
        privateKey: privateKey,
        signingFunction: null
      });
      console.log("sending thor response=" + response.result);
      if (!response.result) {
        dispatch(sendEvent(false, "Sorry, your transaction failed. Please try again soon."));
				setTimeout(() => dispatch(clearTransactionEvent()), 2000);
      } else {
        dispatch(sendEvent(false,
        "Transaction complete! Your balance will automatically update when the blockchain has processed it." ));
				setTimeout(() => dispatch(clearTransactionEvent()), 2000);
      }
    } catch (err) {
      console.log("sending thor =" + err.message);
      dispatch(sendEvent(false, "There was an error processing your trasnaction. Please check and try again."));
			setTimeout(() => dispatch(clearTransactionEvent()), 2000);
	    return false;
    }
  }
};

class SendTHOR extends Component {
  constructor(props) {
    super(props);
    this.state = {
      open: true,
      gas: "0",
      neo: "0",
      neo_usd: "0",
      gas_usd: "0",
      value: "0",
      inputEnabled: true,
      fiatVal: 0,
      tokenVal: 0
    };
    this.handleChange = this.handleChange.bind(this);
    this.handleChangeUSD = this.handleChangeUSD.bind(this);
  }

  async componentDidMount() {
    let neo = await axios.get(apiURL("NEO"));
    let gas = await axios.get(apiURL("GAS"));
    neo = neo.data.USD;
    gas = gas.data.USD;
    this.setState({ neo: neo, gas: gas });
  }

  handleChange(event) {
    this.setState({ value: event.target.value }, (sendAmount = value));
    const value = event.target.value * this.state.neo;
    this.setState({ fiatVal: value });
  }

  async handleChangeUSD(event) {
    this.setState({ fiatVal: event.target.value });
    let gas = await axios.get(apiURL("GAS"));
    gas = gas.data.USD;
    this.setState({ gas: gas });
    const value = this.state.fiatVal / this.state.gas;
    this.setState({ value: value }, () => {
      sendAmount = value;
    });
  }

  render() {
    const {
      dispatch,
      wif,
      address,
      status,
      neo,
      gas,
      net,
      confirmPane,
      selectedAsset,
      thor
    } = this.props;

    return (
      <div>
        <Assets />
        <div id="send">
          <div className="row dash-chart-panel">
            <div className="col-xs-9">
              <img
                src={thorLogo}
                alt=""
                width="54"
                className="neo-logo fadeInDown"
              />
              <h2>Send The Key Tokens</h2>
            </div>

            <div className="col-xs-3 top-20 center com-soon">
              Block: {this.props.blockHeight}
            </div>

            <div className="col-xs-12 center">
              <hr className="dash-hr-wide top-20" />
            </div>

            <div className="clearboth" />

            <div className="top-20">
              <div className="col-xs-9">
                <input
                  className="form-send-thor"
                  id="center"
                  placeholder="Enter a valid THOR public address here"
                  ref={node => {
                    sendAddress = node;
                  }}
                />
              </div>
							<Link to="/receive">
              <div className="col-xs-3">
                <div className="thor-button com-soon">
								<span className="glyphicon glyphicon-qrcode marg-right-5" />
								Receive</div>
              </div>
							</Link>

              <div className="col-xs-5 top-20">
                <input
                  className="form-send-thor"
                  type="number"
                  id="assetAmount"
                  min="1"
                  onChange={this.handleChange}
                  value={this.state.value}
                  placeholder="Enter amount to send"
                  ref={node => {
                    sendAmount = node;
                  }}
                />
                <div className="clearboth" />
                <span className="com-soon block top-10">
                  Amount in THOR to send
                </span>
              </div>
              <div className="col-xs-4 top-20">
                <input
                  className="form-send-thor"
                  id="sendAmount"
                  onChange={this.handleChangeUSD}
                  placeholder="Amount in US"
                  value={`${this.state.fiatVal}`}
                />
                <label className="amount-dollar">$</label>
                <div className="clearboth" />
                <span className="com-soon block top-10">Calculated in USD</span>
              </div>
              <div className="col-xs-3 top-20">
                <div id="sendAddress">
                  <button
                    className="thor-button"
                    onClick={() =>
                      sendThorTransaction(
												dispatch, net, address, wif)
                    }
                    ref={node => {
                      confirmButton = node;
                    }}
                  >
                    <span className="glyphicon glyphicon-send marg-right-5" />{" "}
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="send-notice">
            <p>
              Sending THOR requires a balance of 1 GAS+. Only send THOR to a valid address that supports NEP5+ tokens on the NEO blockchain. When sending THOR to an exchange please ensure the address supports THOR tokens.
            </p>
            <div className="col-xs-2 top-20" />
            <div className="col-xs-8 top-20">
              <p
                className="center donations"
                data-tip
                data-for="donateTip"
                onClick={() =>
                  clipboard.writeText("AG3p13w3b1PT7UZtsYBoQrt6yjjNhPNK8b")
                }
              >
                Morpheus Dev Team: AG3p13w3b1PT7UZtsYBoQrt6yjjNhPNK8b
              </p>
              <ReactTooltip
                className="solidTip"
                id="donateTip"
                place="top"
                type="light"
                effect="solid"
              >
                <span>Copy address to send donation</span>
              </ReactTooltip>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  blockHeight: state.metadata.blockHeight,
  wif: state.account.wif,
  address: state.account.address,
  net: state.metadata.network,
  neo: state.wallet.Neo,
  gas: state.wallet.Gas,
  selectedAsset: state.transactions.selectedAsset,
  confirmPane: state.dashboard.confirmPane,
  thor: state.wallet.Thor
});

SendTHOR = connect(mapStateToProps)(SendTHOR);

export default SendTHOR;