export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[kaiCook] Content script loaded.');

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ pong: true });
      }

      if (message.type === 'GET_PAGE_TEXT') {
        sendResponse({ text: document.body.innerText });
      }

      return true;
    });
  },
});
