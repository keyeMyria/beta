import React, { Component } from "react";
import { connect } from "react-redux";
import QRCode from "qrcode.react";
import { clipboard } from "electron";
import { shell } from "electron";
import Modal from "react-modal";
import { api, wallet, sc, rpc, u } from "@cityofzion/neon-js";
import ReactTooltip from "react-tooltip";
import gitsmLogo from "../img/gitsm.png";
import twitsmLogo from "../img/twitsm.png";
import gdmLogo from "../img/gdm.png";
import { ASSETS,TOKEN_SCRIPT,TOKEN_SCRIPT_TEST } from "../core/constants";
import asyncWrap from "../core/asyncHelper";
import { flatten } from 'lodash'
import {
    sendEvent,
    clearTransactionEvent,
    toggleAsset
} from "../modules/transactions";
import {oldMintTokens} from "../core/oldMintTokens";
import { Link } from "react-router";
import numeral from "numeral";
import TopBar from "./TopBar";
import Search from "./Search";

const openExplorer = srcLink => {
  shell.openExternal(srcLink);
};


let payment_method, token_script, amount;

const styles = {
    overlay: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)"
    },
    content: {
        margin: "100px auto 0",
        padding: "30px 30px 30px 30px",
        border: "4px solid #222",
        background: "rgba(12, 12, 14, 1)",
        borderRadius: "20px",
        top: "100px",
        height: 480,
        width: 600,
        left: "100px",
        right: "100px",
        bottom: "100px",
        boxShadow: "0px 10px 44px rgba(0, 0, 0, 0.45)"
    }
};


const getLink = (net, address) => {
	let base;
	if (net === "MainNet") {
		base = "https://neotracker.io/address/";
	} else {
		base = "https://testnet.neotracker.io/address/";
	}
	return base + address;
};


// Implement ICO for NEP5
//Checking validate Mint Tokens Inputs
const validateMintTokensInputs = (
	neoToMint,//Number
	gasToMint,//Number
	scriptHash,//string
	NEO,//Number
	GAS //Number
) => {
	let message;

	if (neoToMint < 0 || gasToMint < 0 || (neoToMint ===0 && gasToMint === 0)) {
        message = 'You must send positive amounts of NEO or GAS.';
		return [false,message];
	}

	if (neoToMint && parseFloat(neoToMint) !== parseInt(neoToMint)) {
        message = 'You cannot send fractional NEO to a token sale.';
        return [false, message];
	}

	if ((neoToMint && isNaN(neoToMint)) || (gasToMint && isNaN(gasToMint))) {
        message = 'Please enter valid numbers only';
        return [false, message];
	}

	if (neoToMint > NEO) {
        message = 'You do not have enough NEO to send.';
        return [false, message];
	}

	if (gasToMint > GAS) {
        message = 'You do not have enough GAS to send.';
        return [false, message];
	}

    if (
        scriptHash.slice(0, 1) !== '0x' &&
        scriptHash.length !== 42 &&
        scriptHash.length !== 40
    ) {
        message = 'Not a valid script hash.';
        return [false, message];
    }

    return [true, ''];
}

const participateInSaleEvent = (dispatch, wif, neo, gas, net, address) => {
	let neoToSend, gasToSend, scriptHash;
	if (payment_method.value === "NEO") {
		neoToSend = amount.value;
		gasToSend = '0';
	} else if (payment_method.value === "GAS") {
		neoToSend = '0';
		gasToSend = amount.value;
	} else {
		neoToSend = '0';
		gasToSend = '0';
	}

	console.log("neoToSend = " + neoToSend);
	console.log("gasTosend = " + gasToSend);
	if (token_script.value !== undefined || token_script.value !== '') {
		scriptHash = token_script.value;
	} else {
		dispatch(sendEvent(false,"Please select token!"));
	}

	console.log("scriptHash = " + scriptHash);
	participateInSale(
    neoToSend,
		gasToSend,
		scriptHash,
		'0',
		dispatch,
		wif,
		null,
		neo,
		gas,
		net,
		address
	).then(success => {
		if (success) {
			dispatch(sendEvent(true,"Congratualtions. Token purchase was successful!"));
			return true;
		} else {
            dispatch(sendEvent(false,"Sorry. Your transaction failed. Please try again shortly."));
            return false;
		}
	})
}


const validateOldMintTokensInputs = (
    neoToMint,
    scriptHash,
    NEO,
    GAS
) => {
    let message

    if (neoToMint <= 0) {
        message = 'You must send a positive integer of NEO above 0.'
        return [false, message]
    }

    if (neoToMint && parseFloat(neoToMint) !== parseInt(neoToMint)) {
        message = 'You cannot send fractional NEO to a token sale.'
        return [false, message]
    }

    if (neoToMint && isNaN(neoToMint)) {
        message = 'Please enter valid numbers only'
        return [false, message]
    }

    if (neoToMint > NEO) {
        message = 'You do not have enough NEO to send.'
        return [false, message]
    }

    if (
        scriptHash.slice(0, 1) !== '0x' &&
        scriptHash.length !== 42 &&
        scriptHash.length !== 40
    ) {
        message = 'Not a valid script hash.'
        return [false, message]
    }

    return [true, '']
}

const oldParticipateInSaleEvent = (dispatch, wif, neo, gas, net, address) => {
    let neoToSend, gasToSend, scriptHash;
    if (payment_method.value === "NEO") {
        neoToSend = amount.value;
        gasToSend = '0';
    } else if (payment_method.value === "GAS") {
        neoToSend = '0';
        gasToSend = amount.value;
    } else {
        neoToSend = '0';
        gasToSend = '0';
    }

    console.log("token_script = "+ token_script)
    if (token_script.value !== undefined || token_script.value !== '') {
        scriptHash = token_script.value;
    } else {
        dispatch(sendEvent(false,"Please select token!"));
    }

    oldParticipateInSale(
    	neoToSend,
		scriptHash,
		'0',
		dispatch,
		wif,
		null,
		neo,
		gas,
		net,
		address
	).then(success => {
		if (success) {
            dispatch(sendEvent(true,"Congratulations. ICO tokens purchased successfully! Your balance will be updated shortly."));
            setTimeout(() => dispatch(clearTransactionEvent()), 5000);
        		return true;
		} else {
            dispatch(sendEvent(false,"Sorry, transaction failed. Please try again soon."));
            setTimeout(() => dispatch(clearTransactionEvent()), 3000);
        		return false;
		}
	})

}

const oldParticipateInSale = async(
	neoToSend,
	scriptHash,
	gasCost,
	dispatch,
	wif,
	publicKey,
	neo,
	gas,
	net,
	address
) => {
	const neoToMint = Number(neoToSend);
    const [isValid, message] = validateOldMintTokensInputs(
        neoToMint,
        scriptHash,
        neo,
        gas
    );

    if (!isValid) {
        dispatch(sendEvent(false,message));
        return false;
    }

    const _scriptHash =
        scriptHash.length === 40
            ? scriptHash
            : scriptHash.slice(2, scriptHash.length)

    const wifOrPublicKey = wif;
	const [error ,response] = await asyncWrap(
        oldMintTokens(
        	net,
			_scriptHash,
			wifOrPublicKey,
			neoToMint,
			0
		)
	)


    if (error || !response || !response.result) {
        return false
    }

    return true;

}

const participateInSale = async(
	neoToSend,//string
    gasToSend,//string
    scriptHash,//string
    gasCost,//string
    dispatch,
    wif,//string
    publicKey,//string
	neo,
    gas,
    net,
    address
) => {
	const account = new wallet.Account(wif);
	const neoToMint = Number(neoToSend);
	const gasToMint = Number(gasToSend);

	const [isValid, message] = validateMintTokensInputs(
		neoToMint,
		gasToMint,
		scriptHash,
		neo,
		gas
	);

	if(!isValid) {
		dispatch(sendEvent(false, message));
		return false;
	}

    const _scriptHash =
        scriptHash.length === 40
            ? scriptHash
            : scriptHash.slice(2, scriptHash.length);

    // let notificationId
    //
    // if (isHardwareLogin) {
    //     notificationId = dispatch(
    //         showInfoNotification({
    //             message: 'Please sign the transaction on your hardware device',
    //             autoDismiss: 0
    //         })
    //     )
    // } else {
    //     notificationId = dispatch(
    //         showInfoNotification({ message: 'Sending transaction', autoDismiss: 0 })
    //     )
    // }

    const scriptHashAddress = wallet.getAddressFromScriptHash(_scriptHash);
    console.log("scriptHashAddress = " + scriptHashAddress);
    const intents = [[ASSETS.NEO, neoToMint], [ASSETS.GAS, gasToMint]]
        .filter(([symbol, amount]) => amount > 0)
        .map(([symbol, amount]) =>
            api.makeIntent({ [symbol]: amount }, scriptHashAddress)
        );

    const script = {
        scriptHash: _scriptHash,
        operation: 'mintTokens',
        args: []
    };

    const config = {
        net,
        address,
        privateKey: account.privateKey,
        intents: flatten(intents),
        script,
        gas: 0,
        publicKey: null,
        signingFunction:  null
    };

    const [error, response] = await asyncWrap(api.doInvoke(config));
    console.log("error = " + JSON.stringify(error));
    console.log("token sale response = " + JSON.stringify(response));
    if (error !== null || error!== undefined || response === null || response === undefined
	|| response.response === null || response.response === undefined || response.response.result === false) {
        //dispatch(sendEvent(false,'Sale participation failed, please check your script hash again.'));
        return false
    }
	return true;
}

const StatusMessage = ({ sendAmount, sendTokenScript, handleCancel, handleConfirm }) => {
    let message = (
		<Modal
			isOpen={true}
			closeTimeoutMS={5}
			style={styles}
			contentLabel="Modal"
			ariaHideApp={false}
		>
			<div>
				<div className="center modal-alert">
				</div>
				<div className="center modal-alert top-20">
        <h2>Confirmation Needed!</h2>
          <strong>Send {sendAmount} Neo to GDM Token Sale</strong><br />
          <strong>Scripthash:</strong> <span
          onClick={() =>
          openExplorer("https://neotracker.io/contract/d1e37547d88bc9607ff9d73116ebd9381c156f79")
          }
          >d1e37547d88bc9607ff9d73116ebd9381c156f79</span><br /><br />
          Please confirm the hashscript and that the token sale is open before sending funds. Sending funds to a sale that has ended or that has not started may result in your funds being lost. This action is irreversible.
				</div>
				<div className="row top-30">
					<div className="col-xs-6">
						<button className="cancel-button" onClick={handleCancel}>Cancel</button>
					</div>
					<div className="col-xs-6">
						<button className="btn-send" onClick={handleConfirm}>Confirm</button>
					</div>
				</div>
			</div>
		</Modal>
    );
    return message;
};

class GDMSale extends Component {
    constructor(props){
        super(props);
        this.state = {
            modalStatus: false
        }
    }

	render() {
		console.log(this.props.net);
		return (
			<div >
      {
          this.state.modalStatus?
						<StatusMessage
							sendAmount={amount.value}
							sendTokenScript={token_script.value}
							handleCancel = {
            () => {
                this.setState({
                    modalStatus: false
                })
            }
                  }
							handleConfirm ={() => {
            oldParticipateInSaleEvent(
                this.props.dispatch,
                this.props.wif,
                this.props.neo,
                this.props.gas,
                this.props.net,
                this.props.address
            )
            this.setState({
                modalStatus: false
            })
                  }}
						/>
              :
              null
      }

      <div className="breadBar">
      <div className="col-flat-10">
      <ol id="no-inverse" className="breadcrumb">
      <li><Link to="/dappBrowser">dApp Store</Link></li>
      <li className="active">Guardium</li>
      </ol>
      </div>

      <div className="col-flat-2">
      <Search />
      </div>
      </div>

      <TopBar />
			<div className="row top-20">

			<div className="col-xs-6">
			<div className="col-xs-12 center top-20">
      <div id="no-inverse">
      <img
        src={gdmLogo}
        alt=""
        width="150"
        className="flipInY"
      />
      </div>
			<div className="clearboth" />
			<div className="top-30">Guardium is an NEP-5 token built on the NEO ecosystem. Guardium powers the global, decentralized 9-1-1 public utility of Guardian Circle.</div>
			</div>
			</div>
			<div className="col-xs-5" />

			</div>


			<div className="row top-20" />


			<div className="col-xs-2">
			<input
			className="form-control-exchange"
			ref={node => (amount = node)}
			 />
			</div>
			<div className="col-xs-2">
			<select
			 name="select-profession"
			 id="select-profession"
			 placeholder="Enter Amount to send"
			 className=""
			 ref={node => (payment_method = node)}
			>
							<option value="NEO">
							NEO
							</option>
			</select>
			</div>

			<div className="col-xs-2">
					<button
					className="btn-send"
					onClick={() => {
					if (token_script.value === '') {
							this.props.dispatch(sendEvent(false, "You can not send NEO to a token sale without a valid hashscript address."));
							setTimeout(() => this.props.dispatch(clearTransactionEvent()), 1000);
							return false;
					}

					if (payment_method.value === '') {
							this.props.dispatch(sendEvent(false, "Please select a payment method."));
							setTimeout(() => this.props.dispatch(clearTransactionEvent()), 1000);
							return false;
					}

					if (parseFloat(amount.value) <= 0) {
							this.props.dispatch(sendEvent(false, "You cannot send negative amounts of NEO."));
							setTimeout(() => this.props.dispatch(clearTransactionEvent()), 1000);
							return false;
					}

					if (parseFloat(amount.value) !== parseInt(amount.value)) {
							this.props.dispatch(sendEvent(false, "You cannot send a fraction of a NEO."));
							setTimeout(() => this.props.dispatch(clearTransactionEvent()), 1000);
							return false;
					}

					this.setState({
							modalStatus: true
					})
									}
									}
					>
						Send
					</button>

					</div>

			<div className="col-xs-5" />
			<input
			className="hiddendiv"
			value="d1e37547d88bc9607ff9d73116ebd9381c156f79"
			placeholder="d1e37547d88bc9607ff9d73116ebd9381c156f79"
			ref={node => (token_script = node)}
	 		/>

<div className="col-xs-5 " />
<div className="clearboth" />


<div className="col-xs-3 top-20">
<strong className="pointer"><Link
onClick={() =>
openExplorer("https://guardium.co/#whitelist")
}
>Register for Whitelist</Link></strong><br />
	 <strong>Starts: May 3rd, 2018</strong><br />
	 <strong>Ends: TBD</strong><br />
	 <br />
	 <span
   className="pointer"
   onClick={() =>
   openExplorer("https://guardium.co")
   }
   ><strong>
   <span className=" glyphicon glyphicon-link marg-right-5" /> Visit Website</strong></span><br />
	 </div>

<div className="col-xs-4 top-30">
	 Total Supply: 100 million GDM<br />
	 Token Sale: 30%<br />
	 Early Contributors & Advisors: 5%<br />
	 Technology: 10%<br />
	 Marketing & User Adoption: 45%<br />
	 Team: 10%<br />
</div>

<div id="no-inverse" className="gdmiPhone fadeInDown" />

	 <div className="tokenfooter font-16 pointer">
   <Link
   onClick={() =>
   openExplorer("https://neotracker.io/contract/d1e37547d88bc9607ff9d73116ebd9381c156f79")
   }
   ><strong><span className=" glyphicon glyphicon-link marg-right-5" /> Verify Scripthash:</strong> d1e37547d88bc9607ff9d73116ebd9381c156f79</Link><br />
	 <strong>Legal Disclaimer:</strong> Please follow all local laws as well as all KYC and AML requirements when participating in a token sale. If your NEO address is not pre-qualified for the token sale your funds may be lost. Sending more than the maximum amount may result in the excess tokens being lost. Do not send tokens to a sale that has ended. Please research every token sale carefully before participating. Morpheus S.S. Ltd is not liable for the loss of any tokens.</div>





		</div>
		);
	}
}

const mapStateToProps = state => ({
	blockHeight: state.metadata.blockHeight,
	net: state.metadata.network,
	address: state.account.address,
	wif: state.account.wif,
	neo: state.wallet.Neo,
	price: state.wallet.price,
	gas: state.wallet.Gas
});

GDMSale = connect(mapStateToProps)(GDMSale);
export default GDMSale;
