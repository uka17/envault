interface MessageModel {
  senderName: string;
  receiverName: string;
  stashKey: string;
  message: number;
}

import config from "../config/config";

function getEmailText(model: MessageModel) {
  const message = `Hi, ${model.receiverName}.<br>
  ${model.senderName} scheduled an message send out for you. <br>
  Message was encrypted by sender, so you can read it only with help of secret key you was provided by ${model.senderName}.<br><br>
  Please prepare a secret key and follow <a href="${config.readMessageUrl}/${model.stashKey}">this link</a> to decrypt and read the message.<br><br>
  
  Thank you.`;

  return message;
}

export { getEmailText };
